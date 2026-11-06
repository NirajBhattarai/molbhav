import "server-only";
import { after } from "next/server";
import type { Client, PrivateKey } from "@hiero-ledger/sdk";
import { ENS_PARENT_DEFAULT, ensName } from "@/lib/ens";
import { query } from "@/lib/server/db";

/*
 * The deal log: a Hedera Consensus Service topic where every agreed and every paid deal is posted
 * as a small JSON message. Anyone can read the topic on HashScan or the mirror node; only the
 * market's operator key may post to it. No buyer identity goes on it: the bargain id, the stall,
 * the item and the price only. See docs/hcs.md.
 */

export type DealEvent =
  | {
      type: "deal.agreed";
      bargain: string;
      stall: string;
      ens: string | null;
      agent: string | null;
      item: string;
      priceInr: number;
    }
  | {
      type: "deal.paid";
      bargain: string;
      stall: string;
      ens: string | null;
      payTo: string;
      amount: string; // tinybars
      payTx: string;
    };

const env = (k: string) => process.env[k]?.trim() || "";
export const dealTopic = () => env("HEDERA_DEAL_TOPIC");
export const dealLogConfigured = () =>
  Boolean(env("HEDERA_OPERATOR_ID") && env("HEDERA_OPERATOR_KEY") && dealTopic());

const network = () =>
  env("NEXT_PUBLIC_HEDERA_NETWORK").toLowerCase() === "mainnet" ? "mainnet" : "testnet";

/** HashScan page of the deal log, or null when there is none. */
export const dealLogUrl = () =>
  dealTopic() ? `https://hashscan.io/${network()}/topic/${dealTopic()}` : null;

/** The operator key as the portal gives it: DER, or raw hex (ECDSA or ED25519). */
export async function operatorKey(text: string): Promise<PrivateKey> {
  const { PrivateKey } = await import("@hiero-ledger/sdk");
  try {
    return PrivateKey.fromStringDer(text);
  } catch {
    return /^(0x)?[0-9a-f]{64}$/i.test(text)
      ? PrivateKey.fromStringECDSA(text)
      : PrivateKey.fromString(text);
  }
}

let client: Promise<Client> | null = null;

function operatorClient() {
  client ??= (async () => {
    const { Client, Hbar } = await import("@hiero-ledger/sdk");
    const c = network() === "mainnet" ? Client.forMainnet() : Client.forTestnet();
    return c
      .setOperator(env("HEDERA_OPERATOR_ID"), await operatorKey(env("HEDERA_OPERATOR_KEY")))
      .setDefaultMaxTransactionFee(new Hbar(1));
  })().catch((err) => {
    client = null;
    throw err;
  });
  return client;
}

/** Posts one deal event to the topic; returns its sequence number, or null when not set up. */
export async function postDeal(event: DealEvent): Promise<number | null> {
  if (!dealLogConfigured()) return null;
  const { TopicMessageSubmitTransaction } = await import("@hiero-ledger/sdk");
  const c = await operatorClient();
  const message = JSON.stringify({ v: 1, ...event, at: new Date().toISOString() });
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(dealTopic())
    .setMessage(message)
    .execute(c);
  const receipt = await tx.getReceipt(c);
  return receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : null;
}

type DealRow = {
  ens_label: string | null;
  ens_status: string | null;
  agent_id: string | null;
  item: string;
};

/** The public side of a deal: its stall's ENS name and agent, and the item. */
async function dealRow(bargainId: string, stallId: string) {
  const [row] = await query<DealRow>(
    `SELECT s.ens_label, s.ens_status, s.agent_id, i.name AS item
     FROM offers o
     JOIN stalls s ON s.id = o.stall_id
     JOIN stall_items i ON i.id = o.item_id
     WHERE o.bargain_id = $1::uuid AND o.stall_id = $2`,
    [bargainId, stallId],
  );
  if (!row) return null;
  const parent = env("ENS_PARENT") || ENS_PARENT_DEFAULT;
  return {
    ...row,
    ens: row.ens_label && row.ens_status === "live" ? ensName(row.ens_label, parent) : null,
  };
}

/** Logs an agreed deal on the topic (after the response). */
export function logDealAgreed(bargainId: string, stallId: string, priceInr: number) {
  logDeal(async () => {
    const d = await dealRow(bargainId, stallId);
    if (!d) return null;
    return {
      type: "deal.agreed",
      bargain: bargainId,
      stall: stallId,
      ens: d.ens,
      agent: d.agent_id,
      item: d.item,
      priceInr,
    };
  });
}

/** Logs a paid deal on the topic (after the response), with the x402 settlement transaction. */
export function logDealPaid(
  bargainId: string,
  stallId: string,
  paid: { payTo: string; amount: string; payTx: string },
) {
  logDeal(async () => {
    const d = await dealRow(bargainId, stallId);
    return { type: "deal.paid", bargain: bargainId, stall: stallId, ens: d?.ens ?? null, ...paid };
  });
}

/**
 * Posts a deal once the response has gone, so agreeing and paying never wait on Hedera. Failures
 * are logged, never thrown: the deal itself is already saved.
 */
function logDeal(build: () => Promise<DealEvent | null>) {
  if (!dealLogConfigured()) return;
  const run = async () => {
    const event = await build().catch(() => null);
    if (!event) return;
    await postDeal(event).catch((err) =>
      console.error("hcs deal log", event.type, event.bargain, err),
    );
  };
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts, tests)
  }
}
