/*
 * x402 payments on Hedera (the `exact` scheme, x402 v2): a buyer pays an agreed deal in USDC.
 * The buyer signs a USDC transfer whose transaction id is on the facilitator's account, so the
 * facilitator pays the network fee and submits it; the buyer needs no HBAR for fees.
 * Pure (no network): what a deal costs in USDC and what the stall asks for. See docs/x402.md.
 */

export const X402_VERSION = 2;
export const HEDERA_TESTNET = "hedera:testnet";
export const HEDERA_MAINNET = "hedera:mainnet";
/** Circle's USDC on Hedera (testnet / mainnet), 6 decimals. */
export const USDC = { "hedera:testnet": "0.0.429274", "hedera:mainnet": "0.0.456858" } as const;
export const USDC_DECIMALS = 6;
/** How long the buyer's signed transfer stays valid for the facilitator. */
export const PAY_TIMEOUT_S = 180;
/** Rupees per US dollar when no rate is configured (X402_INR_PER_USD). */
export const DEFAULT_INR_PER_USD = 88;

export type HederaNet = typeof HEDERA_TESTNET | typeof HEDERA_MAINNET;

/** Rupees per US dollar for pricing deals in USDC (server env X402_INR_PER_USD). */
export function inrPerUsd(): number {
  const rate = Number(process.env.X402_INR_PER_USD);
  return rate > 0 ? rate : DEFAULT_INR_PER_USD;
}

const ENTITY = /^0\.0\.\d+$/;
export const isHederaId = (v: unknown): v is string => typeof v === "string" && ENTITY.test(v);

/** A rupee price in USDC's smallest unit, rounded up so the stall never gets less. */
export function usdcUnits(rupees: number, inrPerUsd = DEFAULT_INR_PER_USD): bigint {
  if (!(rupees > 0) || !(inrPerUsd > 0)) throw new Error("price and rate must be positive");
  // Work in micro-rupees to keep the division exact for whole rupees.
  const micro = BigInt(Math.round(rupees * 1e6));
  const rate = BigInt(Math.round(inrPerUsd * 1e6));
  return (micro * BigInt(10 ** USDC_DECIMALS) + rate - BigInt(1)) / rate;
}

/** USDC units as "1.234567" with trailing zeros trimmed to at least two decimals ("2.50"). */
export function formatUsdc(units: bigint | string): string {
  const n = BigInt(units);
  const whole = n / BigInt(10 ** USDC_DECIMALS);
  const frac = (n % BigInt(10 ** USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, "0");
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
  inrPerUsd?: number;
  payTo: string;
  feePayer: string;
}): DealRequirements {
  if (!isHederaId(p.payTo)) throw new Error(`payTo must be a Hedera account id, got ${p.payTo}`);
  if (!isHederaId(p.feePayer)) throw new Error(`feePayer must be a Hedera account id`);
  return {
    scheme: "exact",
    network: p.network,
    asset: USDC[p.network],
    amount: usdcUnits(p.rupees, p.inrPerUsd).toString(),
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
