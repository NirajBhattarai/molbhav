export type Style = "friendly" | "firm";

/*
 * How the agents concede: pure arithmetic, no rounds to count. Each side works to a deadline and moves
 * with the other (docs/negotiation.md has the research):
 *   - over time (Faratin, Sierra & Jennings): the offer moves from where it started to its limit as
 *     t goes from 0 to 1, by t^(1/β). β under 1 holds until late (Boulware), over 1 gives early (Conceder).
 *   - in kind (relative tit-for-tat): it moves by the same percentage the other side just moved.
 *   - it takes the further of the two, and stops when countering can't gain anything: the other side
 *     has come to what it would offer next (AC_next), the gap is too small to argue over, the other
 *     side has stopped moving or says it's final, or time is up (AC_time, in `settle`).
 * The AI never sees any of this: it only words the prices, and code holds the deadline.
 */

/**
 * How long the buyer's agent bargains with one stall, from its hello. No counter goes out after it,
 * and settling after it speaks in catalog phrases, not Gemini.
 */
export const TALK_MS = 60_000;
/**
 * The last moment, from the hello, to make the firm halfway offer before the budget; after it, the
 * budget comes straight away. With A2A answers capped at 12 s (a2a/client.ts), the halfway offer,
 * the budget, and the accept fit before the 120 s maxDuration of the function the talk runs in
 * (the home page's `after()`): 75 + 3 × (12 + pacing) < 120.
 */
export const HALFWAY_BY_MS = 75_000;
/** A backstop on messages, for when replies come fast (no AI); not the plan. */
export const MAX_EXCHANGES = 10;
/** Counters a stall answers before its price is final: the same backstop on its side. */
export const MAX_COUNTERS = 8;

/** β: how early each side gives ground. The buyer's agent holds; a friendly stall gives early. */
const BETA = { buyer: 0.5, friendly: 1.5, firm: 0.6 } as const;
/** The buyer's agent opens at this share of the ask. */
const OPENING = 0.65;
/** A move under this share of the ask isn't a move. */
const STILL = 0.005;
/** A gap under this share of the price isn't worth another round (at least ₹10). */
const NOT_WORTH_IT = 0.03;

/** A price as a person would say it: to the nearest 50 above ₹1,000, 10 above ₹100, else the rupee. */
export const nice = (n: number) => {
  const step = n >= 1000 ? 50 : n >= 100 ? 10 : 1;
  return Math.round(n / step) * step;
};

/** How far along the talks are, 0 to 1: by the clock, or by messages when replies come fast. */
export const progress = (elapsedMs: number, exchanges: number) =>
  Math.min(1, Math.max(elapsedMs / TALK_MS, exchanges / MAX_EXCHANGES));

/** Where the time curve has reached at `t`: from `start` towards `end`. */
const overTime = (start: number, end: number, t: number, beta: number) =>
  start + (end - start) * t ** (1 / beta);

// ---- The buyer's agent ----

/** Its first counter. */
export const openingOffer = (ask: number, limit: number) => Math.min(nice(ask * OPENING), limit);

/** Its next counter: the time curve or the stall's own percentage move, whichever goes further. */
export function nextOffer(o: {
  opening: number;
  mine: number;
  limit: number;
  /** The stall's price before and after its last move. */
  from: number;
  to: number;
  t: number;
}) {
  const inKind = o.mine * (1 + Math.max(0, o.from - o.to) / o.from);
  const planned = Math.max(o.mine, overTime(o.opening, o.limit, o.t, BETA.buyer), inKind);
  return Math.min(o.limit, nice(planned));
}

/** A firm offer before the whole budget: halfway there. */
export const halfwayOffer = (mine: number, budget: number) => nice((mine + budget) / 2);

/** Whether to stop countering and take the stall's price: AC_next, or a gap too small to argue. */
export const worthTaking = (theirs: number, mine: number, next: number, limit: number) =>
  theirs <= limit && (theirs <= next || theirs - mine <= Math.max(10, theirs * NOT_WORTH_IT));

/** Whether the stall has stopped moving: its last two moves were next to nothing. */
export function stopped(prices: number[], ask: number) {
  if (prices.length < 3) return false;
  const [a, b, c] = prices.slice(-3);
  return a - b < ask * STILL && b - c < ask * STILL;
}

// ---- The stall's agent ----

/**
 * The least a stall may ask this round, by the same two rules, before the lowest price and any rival
 * are applied. `lastTarget` is the buyer's offer before this one.
 */
export function stallsLeast(s: {
  ask: number;
  asking: number;
  target: number;
  lastTarget?: number;
  floor: number;
  /** This counter's number, from 1. */
  counter: number;
  style: Style;
}) {
  const t = Math.min(1, s.counter / MAX_COUNTERS);
  const curve = overTime(s.ask, Math.max(s.target, s.floor), t, BETA[s.style]);
  const raised = s.lastTarget ? Math.max(0, s.target - s.lastTarget) / s.lastTarget : 0;
  return nice(Math.min(curve, s.asking * (1 - raised)));
}
