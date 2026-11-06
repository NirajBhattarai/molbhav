/*
 * x402 payments on Hedera (the `exact` scheme, x402 v2): a buyer pays an agreed deal in HBAR.
 * The buyer signs an HBAR transfer whose transaction id is on the facilitator's account, so the
 * facilitator pays the network fee and submits it. HBAR needs no token association, and testnet
 * HBAR comes free from portal.hedera.com/faucet.
 * Pure (no network): what a deal costs in HBAR and what the stall asks for. See docs/x402.md.
 */

export const X402_VERSION = 2;
export const HEDERA_TESTNET = "hedera:testnet";
export const HEDERA_MAINNET = "hedera:mainnet";
/** x402's asset id for native HBAR. */
export const HBAR = "0.0.0";
/** 1 HBAR = 10⁸ tinybars. */
export const HBAR_DECIMALS = 8;
/** How long the buyer's signed transfer stays valid for the facilitator. */
export const PAY_TIMEOUT_S = 180;
/** Rupees per HBAR when no rate is configured (X402_INR_PER_HBAR). Testnet: a fixed rate is fine. */
export const DEFAULT_INR_PER_HBAR = 15;

export type HederaNet = typeof HEDERA_TESTNET | typeof HEDERA_MAINNET;

/** Rupees per HBAR for pricing deals (server env X402_INR_PER_HBAR). */
export function inrPerHbar(): number {
  const rate = Number(process.env.X402_INR_PER_HBAR);
  return rate > 0 ? rate : DEFAULT_INR_PER_HBAR;
}

const ENTITY = /^0\.0\.\d+$/;
export const isHederaId = (v: unknown): v is string => typeof v === "string" && ENTITY.test(v);

/** A rupee price in tinybars, rounded up so the stall never gets less. */
export function tinybars(rupees: number, inrPerHbar = DEFAULT_INR_PER_HBAR): bigint {
  if (!(rupees > 0) || !(inrPerHbar > 0)) throw new Error("price and rate must be positive");
  // Work in micro-rupees to keep the division exact for whole rupees.
  const micro = BigInt(Math.round(rupees * 1e6));
  const rate = BigInt(Math.round(inrPerHbar * 1e6));
  return (micro * BigInt(10 ** HBAR_DECIMALS) + rate - BigInt(1)) / rate;
}

/** Tinybars as HBAR, "11.73333334", with trailing zeros trimmed to at least two decimals. */
export function formatHbar(units: bigint | string): string {
  const n = BigInt(units);
  const whole = n / BigInt(10 ** HBAR_DECIMALS);
  const frac = (n % BigInt(10 ** HBAR_DECIMALS)).toString().padStart(HBAR_DECIMALS, "0");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${trimmed}`;
}

export type DealRequirements = {
  scheme: "exact";
  network: HederaNet;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string };
};

/** What the stall asks for one agreed deal. */
export function dealRequirements(p: {
  network: HederaNet;
  rupees: number;
  inrPerHbar?: number;
  payTo: string;
  feePayer: string;
}): DealRequirements {
  if (!isHederaId(p.payTo)) throw new Error(`payTo must be a Hedera account id, got ${p.payTo}`);
  if (!isHederaId(p.feePayer)) throw new Error(`feePayer must be a Hedera account id`);
  return {
    scheme: "exact",
    network: p.network,
    asset: HBAR,
    amount: tinybars(p.rupees, p.inrPerHbar).toString(),
    payTo: p.payTo,
    maxTimeoutSeconds: PAY_TIMEOUT_S,
    extra: { feePayer: p.feePayer },
  };
}

/** True when the buyer signed for exactly what we asked (the facilitator checks the transfer). */
export function sameRequirements(
  a: Partial<Record<string, unknown>> | null | undefined,
  b: DealRequirements,
): boolean {
  if (!a) return false;
  const extra = a.extra as { feePayer?: unknown } | undefined;
  return (
    a.scheme === b.scheme &&
    a.network === b.network &&
    a.asset === b.asset &&
    a.amount === b.amount &&
    a.payTo === b.payTo &&
    extra?.feePayer === b.extra.feePayer
  );
}

/** HashScan page for a Hedera transaction id ("0.0.9185802@1755500000.000000000"). */
export function hashscanTxUrl(txId: string, network: HederaNet = HEDERA_TESTNET): string {
  const net = network === HEDERA_MAINNET ? "mainnet" : "testnet";
  return `https://hashscan.io/${net}/transaction/${encodeURIComponent(txId)}`;
}
