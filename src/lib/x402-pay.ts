"use client";

import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import {
  forgetHederaAccount,
  getMagic,
  hbarBalance,
  magicHederaAccount,
  mirrorNode,
  type HederaNetwork,
  type MolbhavMagic,
} from "@/lib/magic";
import { HEDERA_MAINNET, isHederaId } from "@/lib/x402";

/*
 * Pays an agreed deal over x402 from the buyer's Magic Hedera wallet: fetch the deal's 402, sign a
 * HBAR transfer whose transaction id is on the facilitator's account (it pays the fee and submits
 * it), and send it back. The key never leaves Magic; only the signature does.
 */

/** What the buyer is told when a payment fails (all in the i18n catalog). */
export type PayError =
  | "This deal can't be paid right now."
  | "Sign in again to pay."
  | "Your Hedera wallet isn't ready yet. Open your profile, then try again."
  | "Your Hedera wallet needs more testnet HBAR for this. Get some from portal.hedera.com/faucet, then try again."
  | "Your Hedera account {account} needs more testnet HBAR. Send some to it from portal.hedera.com/faucet, then try again."
  | "Your wallet's signature didn't check out. Try again."
  | "The payment didn't go through.";

export type PayOutcome =
  | { ok: true; transaction: string; amount: string }
  | { ok: false; error: PayError; detail?: string; account?: string };

class Unready extends Error {}

/** The paying account holds less than the deal's price (checked before Magic signs). */
class NoFunds extends Error {
  constructor(
    readonly account: string,
    have: bigint,
    need: bigint,
  ) {
    super(`${account} has ${have} tinybars, the deal needs ${need}`);
  }
}

/**
 * Every consensus node the signed transfer may go to. Hedera only accepts a transaction at a node
 * it names, so pinning two nodes made settlement fail whenever the facilitator found both busy
 * ("All nodes are unhealthy"). Like the reference x402 client, sign for the whole network: the
 * live node list from the mirror node, or Hedera's long-standing nodes if that can't be read.
 */
async function nodeIds(network: HederaNetwork): Promise<number[]> {
  const fallback = [3, 4, 5, 6, 7, 8, 9];
  const res = await fetch(`${mirrorNode(network)}/api/v1/network/nodes?limit=25`).catch(() => null);
  const nodes = res?.ok
    ? ((await res.json()) as { nodes?: { node_account_id?: string }[] }).nodes
    : undefined;
  const ids = (nodes ?? [])
    .map((n) => Number(n.node_account_id?.split(".")[2]))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids.slice(0, 10) : fallback; // one Magic signature per node, so cap it
}

function bytesOf(sig: unknown): Uint8Array {
  if (sig instanceof Uint8Array) return sig;
  if (Array.isArray(sig)) return Uint8Array.from(sig);
  if (typeof sig === "string") {
    const hex = sig.startsWith("0x") ? sig.slice(2) : sig;
    if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0)
      return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    return Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
  }
  if (sig && typeof sig === "object") {
    const o = sig as { signature?: unknown; data?: unknown };
    if (o.signature !== undefined) return bytesOf(o.signature);
    if (o.data !== undefined) return bytesOf(o.data);
    return Uint8Array.from(Object.values(sig as Record<string, number>));
  }
  throw new Error("Magic returned no signature");
}

const base64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** The buyer's Hedera account id and public key from Magic. */
async function magicAccount(m: MolbhavMagic, mainnet: boolean) {
  const account = await magicHederaAccount(m, mainnet ? "mainnet" : "testnet");
  if (!account) throw new Unready("no Hedera account on this Magic wallet");
  return account;
}

async function signedTransfer(m: MolbhavMagic, req: PaymentRequirements): Promise<string> {
  const mainnet = req.network === HEDERA_MAINNET;
  const feePayer = (req.extra as { feePayer?: unknown }).feePayer;
  if (!isHederaId(feePayer)) throw new Error("The payment service sent no fee payer.");

  const [{ accountId, publicKey }, sdk] = await Promise.all([
    magicAccount(m, mainnet),
    import("@hiero-ledger/sdk"),
  ]);
  if (req.asset === "0.0.0") {
    const have = await hbarBalance(accountId, mainnet ? "mainnet" : "testnet");
    if (have !== null && have < BigInt(req.amount))
      throw new NoFunds(accountId, have, BigInt(req.amount));
  }
  const { AccountId, Hbar, TokenId, TransactionId, TransferTransaction } = sdk;
  const amount = Number(req.amount);
  const payer = AccountId.fromString(accountId);
  const payTo = AccountId.fromString(req.payTo);

  const tx = new TransferTransaction();
  if (req.asset === "0.0.0") {
    tx.addHbarTransfer(payer, Hbar.fromTinybars(-amount));
    tx.addHbarTransfer(payTo, Hbar.fromTinybars(amount));
  } else {
    const token = TokenId.fromString(req.asset);
    tx.addTokenTransfer(token, payer, -amount);
    tx.addTokenTransfer(token, payTo, amount);
  }
  tx.setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)))
    .setNodeAccountIds(
      (await nodeIds(mainnet ? "mainnet" : "testnet")).map((n) => new AccountId(n)),
    )
    .setTransactionValidDuration(Math.min(req.maxTimeoutSeconds, 180))
    .freeze();
  await tx.signWith(publicKey, async (body) => bytesOf(await m.hedera.sign(body)));
  return base64(tx.toBytes());
}

/** Why a payment failed, in words a buyer can act on. */
function explain(reason: string | undefined, detail: string): PayError {
  if (/INSUFFICIENT|balance|NOT_ASSOCIATED/i.test(detail))
    return "Your Hedera wallet needs more testnet HBAR for this. Get some from portal.hedera.com/faucet, then try again.";
  if (reason?.includes("signature")) return "Your wallet's signature didn't check out. Try again.";
  return "The payment didn't go through.";
}

function failed(error: PayError, detail?: string, account?: string): PayOutcome {
  if (detail) console.warn("x402 pay:", detail);
  return { ok: false, error, detail, account };
}

/** Pay one agreed deal; resolves when the facilitator has settled it on Hedera. */
export async function payDeal(bargainId: string, stallId: string): Promise<PayOutcome> {
  const url = `/api/bargains/${bargainId}/${encodeURIComponent(stallId)}/pay`;
  try {
    const quote = await fetch(url, { cache: "no-store" });
    if (quote.status !== 402) {
      const body = (await quote.json().catch(() => ({}))) as { error?: string };
      return failed("This deal can't be paid right now.", body.error);
    }
    const header = quote.headers.get("PAYMENT-REQUIRED");
    const required: PaymentRequired = header
      ? decodePaymentRequiredHeader(header)
      : ((await quote.json()) as PaymentRequired);
    const accepted = required.accepts[0];
    if (!accepted) return failed("This deal can't be paid right now.");

    const m = await getMagic();
    if (!(await m.user.isLoggedIn())) return failed("Sign in again to pay.");
    const payment: PaymentPayload = {
      x402Version: required.x402Version,
      resource: required.resource,
      accepted,
      payload: { transaction: await signedTransfer(m, accepted) },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payment) },
    });
    const body = (await res.json().catch(() => ({}))) as {
      transaction?: string;
      amount?: string;
      error?: string;
      reason?: string;
    };
    if (!res.ok || !body.transaction) {
      const detail = [body.reason, body.error].filter(Boolean).join(": ");
      return failed(explain(body.reason, detail), detail);
    }
    return { ok: true, transaction: body.transaction, amount: body.amount ?? accepted.amount };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (err instanceof NoFunds) {
      forgetHederaAccount(); // look again after they top up
      return failed(
        "Your Hedera account {account} needs more testnet HBAR. Send some to it from portal.hedera.com/faucet, then try again.",
        detail,
        err.account,
      );
    }
    if (err instanceof Unready)
      return failed(
        "Your Hedera wallet isn't ready yet. Open your profile, then try again.",
        detail,
      );
    return failed("The payment didn't go through.", detail);
  }
}
