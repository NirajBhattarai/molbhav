import { MAX_COUNTERS, nice, stallsLeast, type Style } from "@/lib/server/strategy";

/*
 * The stall agent's pricing: what it asks back for one buyer counter. The one source of these rules;
 * the live stall agent (a2a/stall.ts) calls them, and its Gemini only picks a price inside them.
 * Pure of A2A, Gemini, and chat. Concession rules: strategy.ts / docs/negotiation.md.
 */

export type StallStyle = Style;

/** One priced reply from the stall. */
export type StallPrice = { totalInr: number; final: boolean };

/** Where the talk stands when the buyer counters with `target`. */
export type StallCounter = {
  ask: number;
  /** The stall's price on the table now. */
  asking: number;
  floor: number;
  /** Counters already answered before this one. */
  counters: number;
  /** The buyer's offer before this one. */
  lastTarget?: number;
  style: StallStyle;
  target: number;
  /** A genuine rival offer to beat. */
  beat?: number;
  /** The buyer says this offer is its last. */
  final?: boolean;
};

/**
 * The answers that need no bargaining, or null: a final offer is taken if it clears the floor (else
 * the stall's price is final); after MAX_COUNTERS the price is final; an offer at or over the price
 * gets the price.
 */
export function stallSettles(
  s: Pick<StallCounter, "asking" | "floor" | "counters" | "target" | "final">,
): StallPrice | null {
  if (s.final) {
    const price = s.target >= s.floor ? Math.min(s.target, s.asking) : s.asking;
    return { totalInr: price, final: true };
  }
  if (s.counters >= MAX_COUNTERS) return { totalInr: s.asking, final: true };
  if (s.target >= s.asking) return { totalInr: s.asking, final: false };
  return null;
}

/**
 * The least the stall may ask this round: its time curve or the buyer's move (stallsLeast), a little
 * under a genuine rival, never under the floor nor over its price now.
 */
export function stallLeast(s: StallCounter) {
  const { beat, floor } = s;
  const rivalCut =
    beat === undefined ? Infinity : Math.max(floor, nice(beat - Math.max(1, beat * 0.02)));
  const curve = stallsLeast({
    ask: s.ask,
    asking: s.asking,
    target: s.target,
    lastTarget: s.lastTarget,
    floor,
    counter: s.counters + 1,
    style: s.style,
  });
  return Math.min(s.asking, Math.max(floor, curve), rivalCut);
}

/** The stall's price for one buyer counter by the rules alone (no Gemini): as low as it may go. */
export function decideStallCounter(s: StallCounter): StallPrice {
  return (
    stallSettles(s) ?? {
      totalInr: Math.min(s.asking, Math.max(s.target, stallLeast(s))),
      final: false,
    }
  );
}
