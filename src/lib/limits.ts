import type { Msg } from "@/lib/i18n/catalog";

/**
 * What a buyer lets themselves pay, in whole rupees (null is no limit), and how far their agent may go
 * on its own:
 *   autoAgree  the agent agrees the cheapest deal; off, it brings the price down and hands over
 *   autoOrder  then it pays for that deal in HBAR by x402; only with autoAgree on
 */
export type Limits = {
  perOrder: number | null;
  perDay: number | null;
  autoAgree: boolean;
  autoOrder: boolean;
};

export const NO_LIMITS: Limits = {
  perOrder: null,
  perDay: null,
  autoAgree: false,
  autoOrder: false,
};

/** Seconds a buyer has to stop their agent ordering. */
export const AUTO_SECONDS = 10;

/** How long after its countdown the agent may still pay; later, the buyer pays it themselves. */
export const AUTO_PAY_WINDOW_MS = 2 * 60_000;

/** What a buyer's agent decided about one bargain. */
export type AutoOrder =
  | { skipped: "no-deal" }
  | { skipped: "order" | "day"; limit: number }
  | {
      at: number;
      stallId: string;
      stall: string;
      total: number;
      stopped?: true;
      /** The buyer's wallet is paying it now (claimed once). */
      paying?: true;
      done?: true;
      error?: true;
      /** Paid in HBAR on Hedera over x402, from the buyer's Magic wallet. */
      paid?: boolean;
      settleTx?: string | null;
      x402?: boolean;
      /** Why the wallet couldn't pay (a PayError message), and the account it names. */
      payError?: string;
      payAccount?: string;
    };

/** It's counting down, or paying. */
export const autoPending = (auto: AutoOrder | null) =>
  !!auto && "at" in auto && !auto.stopped && !auto.done && !auto.error;

/** The most a limit can be, ₹1,00,000. */
export const MOST_LIMIT = 100_000;

/** The most the buyer's agent may spend: what they asked for, within their limit for one order. */
export function capped(budget: number | null, { perOrder }: Pick<Limits, "perOrder">) {
  if (budget === null) return perOrder;
  return perOrder === null ? budget : Math.min(budget, perOrder);
}

/** Why these limits can't be saved, or null. */
export function limitsProblem({ perOrder, perDay, autoAgree, autoOrder }: Limits): Msg | null {
  const ok = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= MOST_LIMIT);
  if (!ok(perOrder) || !ok(perDay)) return "Limits are from ₹1 to ₹1,00,000.";
  if (perOrder !== null && perDay !== null && perOrder > perDay)
    return "An order can't be more than the day's limit.";
  if (autoOrder && !autoAgree)
    return "Let your agent agree the cheapest deal so it can pay for it.";
  if (autoOrder && (perOrder === null || perDay === null))
    return "Set both limits so your agent can order for you.";
  return null;
}

/** Which limit a payment would break, if any: one order's, or the day's with what's already paid. */
export function brokenLimit(
  amount: number,
  spent: number,
  { perOrder, perDay }: Pick<Limits, "perOrder" | "perDay">,
) {
  if (perOrder !== null && amount > perOrder) return { kind: "order", limit: perOrder } as const;
  if (perDay !== null && spent + amount > perDay) return { kind: "day", limit: perDay } as const;
  return null;
}
