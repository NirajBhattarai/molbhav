import "server-only";
import { HTTPFacilitatorClient } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { ensName, ownerAddress } from "@/lib/ens";
import { appBase } from "@/lib/server/a2a/client";
import { wroteChat } from "@/lib/server/chat-cache";
import { query } from "@/lib/server/db";
import { hederaAddressFromEns } from "@/lib/server/ens";
import { redis, redisConfigured } from "@/lib/server/redis";
import {
  HEDERA_MAINNET,
  HEDERA_TESTNET,
  X402_VERSION,
  dealRequirements,
  inrPerUsd,
  isHederaId,
  sameRequirements,
  type DealRequirements,
  type HederaNet,
} from "@/lib/x402";

/*
 * x402 for agreed deals: the stall's resource server. GET a deal's payment requirements (402),
 * then POST the buyer's signed USDC transfer; the facilitator verifies and settles it on Hedera,
 * and the offer becomes paid with the transaction id as proof.
 *
 *   x402:fee-payer:{network}    the facilitator's fee-payer account (from /supported)   1 h
 *   x402:pay-to:{evm address}   the stall's Hedera account id (from the mirror node)    1 day
 */

const FACILITATOR = () =>
  (process.env.X402_FACILITATOR_URL?.trim() || "https://x402.org/facilitator").replace(/\/$/, "");
const MIRROR: Record<HederaNet, string> = {
  [HEDERA_TESTNET]: "https://testnet.mirrornode.hedera.com",
  [HEDERA_MAINNET]: "https://mainnet-public.mirrornode.hedera.com",
};

export const x402Network = (): HederaNet =>
  (process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? "testnet").trim().toLowerCase() === "mainnet"
    ? HEDERA_MAINNET
    : HEDERA_TESTNET;

const facilitator = () => new HTTPFacilitatorClient({ url: FACILITATOR(), timeoutMs: 30_000 });

async function cached(key: string, ttl: number, load: () => Promise<string | null>) {
  if (redisConfigured()) {
    const hit = await (await redis()).get(key).catch(() => null);
    if (hit) return hit;
  }
  const value = await load();
  if (value && redisConfigured()) {
    await (await redis()).set(key, value, { EX: ttl }).catch(() => {});
  }
  return value;
}

/** The facilitator's fee-payer account for this network, from its /supported list. */
export async function feePayer(network = x402Network()): Promise<string | null> {
  return cached(`x402:fee-payer:${network}`, 3600, async () => {
    const supported = await facilitator().getSupported();
    const kind = supported.kinds.find(
      (k) => k.scheme === "exact" && k.network === network && k.x402Version === X402_VERSION,
    );
    const payer = (kind?.extra as { feePayer?: unknown } | undefined)?.feePayer;
    return isHederaId(payer) ? payer : null;
  });
}

/** A Hedera EVM address (the stall's payout record) as its account id, via the mirror node. */
export async function hederaAccountOf(
  evm: string,
  network = x402Network(),
): Promise<string | null> {
  return cached(`x402:pay-to:${evm.toLowerCase()}`, 86_400, async () => {
    const res = await fetch(`${MIRROR[network]}/api/v1/accounts/${evm}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const account = ((await res.json()) as { account?: unknown }).account;
    return isHederaId(account) ? account : null;
  });
}

type Deal = {
  stall_id: string;
  stall_name: string;
  owner_id: string;
  ens_label: string | null;
  ens_status: string | null;
  item: string;
  current: number | null;
  status: string;
  paid_tx: string | null;
};

async function dealOf(bargainId: string, stallId: string, buyerId: string): Promise<Deal | null> {
  const [deal] = await query<Deal>(
    `SELECT o.stall_id, s.name AS stall_name, s.owner_id, s.ens_label, s.ens_status,
            i.name AS item, o.current, o.status, o.paid_tx
     FROM offers o
     JOIN bargains b ON b.id = o.bargain_id
     JOIN stalls s ON s.id = o.stall_id
     JOIN stall_items i ON i.id = o.item_id
     WHERE o.bargain_id = $1::uuid AND o.stall_id = $2 AND b.buyer_id = $3`,
    [bargainId, stallId, buyerId],
  );
  return deal ?? null;
}

/**
 * Where this stall is paid on Hedera: the Hedera address on its ENS name when it has one (so the
 * buyer pays whoever the name says), else the owner's wallet. Null when neither is a Hedera account.
 */
export async function stallPayTo(
  deal: Pick<Deal, "owner_id" | "ens_label" | "ens_status">,
): Promise<{ account: string; via: "ens" | "wallet" } | null> {
  if (deal.ens_label && deal.ens_status === "live") {
    const evm = await hederaAddressFromEns(ensName(deal.ens_label)).catch(() => null);
    const account = evm && (await hederaAccountOf(evm));
    if (account) return { account, via: "ens" };
  }
  const wallet = ownerAddress(deal.owner_id);
  const account = wallet && (await hederaAccountOf(wallet));
  return account ? { account, via: "wallet" } : null;
}

export type PayQuote =
  | { ok: true; required: PaymentRequired; requirements: DealRequirements; payToVia: string }
  | { ok: false; status: number; error: string };

/** The 402 for one agreed deal: pay `amount` USDC to the stall, fees on the facilitator. */
export async function quoteDeal(
  bargainId: string,
  stallId: string,
  buyerId: string,
): Promise<PayQuote> {
  const deal = await dealOf(bargainId, stallId, buyerId);
  if (!deal) return { ok: false, status: 404, error: "No such deal." };
  if (deal.status === "paid")
    return { ok: false, status: 409, error: "This deal is already paid." };
  if (deal.status !== "agreed" || !deal.current)
    return { ok: false, status: 409, error: "Agree a price first." };

  const network = x402Network();
  const [payTo, payer] = await Promise.all([stallPayTo(deal), feePayer(network)]);
  if (!payTo) return { ok: false, status: 409, error: "This stall has no Hedera account yet." };
  if (!payer) return { ok: false, status: 503, error: "The payment service is unavailable." };

  const requirements = dealRequirements({
    network,
    rupees: deal.current,
    inrPerUsd: inrPerUsd(),
    payTo: payTo.account,
    feePayer: payer,
  });
  return {
    ok: true,
    payToVia: payTo.via,
    requirements,
    required: {
      x402Version: X402_VERSION,
      resource: {
        url: `${appBase()}/api/bargains/${bargainId}/${stallId}/pay`,
        description: `${deal.item} from ${deal.stall_name}, ₹${deal.current}`,
        mimeType: "application/json",
      },
      accepts: [requirements],
    },
  };
}

export type PayResult =
  | { ok: true; transaction: string; payer: string | null; amount: string; network: HederaNet }
  | { ok: false; status: number; error: string; reason?: string };

/**
 * Verifies the buyer's signed transfer against this deal's requirements, settles it through the
 * facilitator, and marks the offer paid with the Hedera transaction id.
 */
export async function settleDeal(
  bargainId: string,
  stallId: string,
  buyerId: string,
  payment: PaymentPayload,
): Promise<PayResult> {
  const quote = await quoteDeal(bargainId, stallId, buyerId);
  if (!quote.ok) return quote;
  const { requirements } = quote;
  if (payment.x402Version !== X402_VERSION || !sameRequirements(payment.accepted, requirements)) {
    return { ok: false, status: 402, error: "The payment doesn't match this deal's price." };
  }

  const client = facilitator();
  const verified = await client.verify(payment, requirements);
  if (!verified.isValid) {
    return {
      ok: false,
      status: 402,
      reason: verified.invalidReason,
      error: verified.invalidMessage || verified.invalidReason || "The payment wasn't accepted.",
    };
  }
  const settled = await client.settle(payment, requirements);
  if (!settled.success || !settled.transaction) {
    return {
      ok: false,
      status: 402,
      reason: settled.errorReason,
      error: settled.errorMessage || settled.errorReason || "The payment didn't go through.",
    };
  }

  const [paid] = await query<{ version: number }>(
    `UPDATE offers o
     SET status = 'paid', paid_tx = $4, paid_amount = $5, paid_asset = $6, paid_by = $7,
         version = o.version + 1, updated_at = now()
     FROM bargains b
     WHERE b.id = o.bargain_id AND b.buyer_id = $3
       AND o.bargain_id = $1::uuid AND o.stall_id = $2 AND o.status = 'agreed'
     RETURNING o.version`,
    [
      bargainId,
      stallId,
      buyerId,
      settled.transaction,
      requirements.amount,
      requirements.asset,
      settled.payer ?? verified.payer ?? null,
    ],
  );
  if (paid) await wroteChat(bargainId, stallId, paid.version);
  return {
    ok: true,
    transaction: settled.transaction,
    payer: settled.payer ?? verified.payer ?? null,
    amount: requirements.amount,
    network: requirements.network,
  };
}
