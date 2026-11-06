import {
  HALFWAY_BY_MS,
  TALK_MS,
  halfwayOffer,
  nextOffer,
  openingOffer,
  progress,
  stopped,
  worthTaking,
} from "@/lib/server/strategy";

/*
 * The buyer's agent brain: how it greets, counters, and settles. Prices come only from strategy.ts
 * (never over the budget). Optional BuyerVoice (Gemini via shopperSays) only words a price code
 * already chose — the model never sees the budget, and every number it writes is validated.
 *
 * Talk shape mirrors A2A: hello → rfq → counter* → accept/settle.
 * Time runs from the hello: no counter goes out after TALK_MS, and settling after it is short
 * (strategy.ts), so a whole talk fits in the function's maxDuration.
 */

/** The other side of the bargain, as the buyer agent sees it: the stall it talks to and the prices it hears. */
export type StallChannel = {
  greet(): Promise<boolean>;
  askPrice(): Promise<{ totalInr: number } | null>;
  counter(
    mine: number,
    theirs: number,
    opts?: {
      final?: boolean;
      lastWord?: boolean;
      /** AI (or catalog) line already chosen. */ line?: string;
    },
  ): Promise<{ totalInr: number; final?: boolean } | null>;
  deal(theirs: number): Promise<void>;
  agree(theirs: number): Promise<void>;
  stallSaid(theirs: number, kind: "waiting" | "haggling"): Promise<void>;
  walkAway(price: number): Promise<void>;
  overBudget(price: number, limit: number): Promise<void>;
  standingOffer(): number | null;
  current(): number | null;
};

/**
 * Explicit AI for the buyer: words a coded price. Must not invent other prices (shopperSays rejects
 * those). Null → the StallChannel falls back to catalog phrases.
 */
export type BuyerVoice = {
  word(turn: {
    intent: "open" | "counter" | "final" | "accept";
    /** Price code chose; AI must name this when counter/final. */
    mine?: number;
    /** Stall's current ask. */
    theirs?: number;
  }): Promise<string | null>;
};

/** Why the buyer stopped countering and moved to settle (or already dealt). */
export type BargainStop =
  "declined" | "deal" | "final" | "stopped" | "time" | "take" | "ceiling" | "silent" | "settle";

/**
 * Start a haggle from scratch: hello → rfq → counters → settle.
 * (negotiate.seedHaggle wraps this with a local StallChannel.)
 */
export async function openHaggle(stall: StallChannel, budget: number | null, voice?: BuyerVoice) {
  const started = Date.now();
  if (!(await stall.greet())) return;

  const quote = await stall.askPrice();
  if (!quote) return;
  const ask = quote.totalInr;
  const limit = Math.min(budget ?? ask, ask);

  await driveHaggle(stall, budget, ask, [ask], openingOffer(ask, limit), voice, started);
}

/**
 * Drive counters until a natural stop, then settle. Used after rfq (openHaggle) or when picking up
 * a talk mid-way. Code picks each `mine`; optional AI only words it.
 * Two clocks: the deadline runs from `started` (the hello; now, for a talk picked up mid-way), so no
 * counter goes out after TALK_MS of the whole talk. How far each counter concedes runs from the
 * first counter, so a slow hello or quote doesn't make the agent give ground faster.
 */
export async function driveHaggle(
  stall: StallChannel,
  budget: number | null,
  ask: number,
  prices: number[],
  first: number,
  voice?: BuyerVoice,
  started = Date.now(),
): Promise<BargainStop> {
  const limit = Math.min(budget ?? ask, ask);
  const opening = openingOffer(ask, limit);
  const counting = Date.now();
  const outOfTime = () => Date.now() - started >= TALK_MS;
  let mine = first;
  let exchanges = 0;
  const settle = () => settleWith(stall, budget, mine, voice, started);

  while (mine < prices.at(-1)!) {
    // Out of time before this counter: settle, rather than start a round that runs past the clock.
    if (outOfTime()) {
      await settle();
      return "time";
    }
    const from = prices.at(-1)!;
    const line = await word(voice, { intent: "counter", mine, theirs: from });
    const answer = await stall.counter(mine, from, { ...(line !== undefined && { line }) });
    exchanges += 1;
    if (!answer) {
      await settle();
      return "silent";
    }

    const theirs = answer.totalInr;
    prices.push(theirs);

    if (theirs <= mine) {
      await stall.deal(theirs);
      return "deal";
    }
    await stall.stallSaid(theirs, "waiting");

    if (answer.final) {
      await settle();
      return "final";
    }
    if (stopped(prices, ask)) {
      await settle();
      return "stopped";
    }

    const t = progress(Date.now() - counting, exchanges);
    if (t >= 1 || outOfTime()) {
      await settle();
      return "time";
    }

    const next = nextOffer({ opening, mine, limit, from, to: theirs, t });
    if (worthTaking(theirs, mine, next, limit)) {
      await settle();
      return "take";
    }
    if (next <= mine) {
      await settle();
      return "ceiling";
    }
    mine = next;
  }

  await settle();
  return "settle";
}

/**
 * Take the stall's price if within budget; else firm halfway, then budget; else walk away or ask
 * the buyer to go higher. Firm/final lines go through BuyerVoice the same way. Late in the
 * talk (from `started`), it speaks in catalog phrases (TALK_MS) and skips the halfway offer
 * (HALFWAY_BY_MS), to finish inside the function's time.
 */
export async function settleWith(
  stall: StallChannel,
  budget: number | null,
  mine?: number,
  voice?: BuyerVoice,
  started?: number,
) {
  const elapsed = started === undefined ? 0 : Date.now() - started;
  if (elapsed >= TALK_MS && voice) voice = QUIET;
  const theirs = stall.current()!;
  const standing = stall.standingOffer();
  if (standing !== null && (budget === null || theirs <= budget)) {
    // agree() posts the accept line on the channel; voice is used on counter/final paths.
    return stall.agree(standing);
  }

  const last = budget ?? theirs;
  const halfway = mine === undefined || elapsed >= HALFWAY_BY_MS ? last : halfwayOffer(mine, last);
  if (halfway < last) {
    const line = await word(voice, { intent: "final", mine: halfway, theirs });
    const firm = await stall.counter(halfway, theirs, {
      final: true,
      lastWord: false,
      ...(line !== undefined && { line }),
    });
    if (!firm) throw new Error("the stall agent didn't answer the firm offer");
    if (firm.totalInr <= halfway) return stall.deal(firm.totalInr);
    await stall.stallSaid(firm.totalInr, "waiting");
  }

  const line = await word(voice, { intent: "final", mine: last, theirs: stall.current()! });
  const answer = await stall.counter(last, stall.current()!, {
    final: true,
    ...(line !== undefined && { line }),
  });
  if (!answer) throw new Error("the stall agent didn't answer the final offer");
  const price = answer.totalInr;
  if (price <= last) return stall.deal(price);
  await stall.stallSaid(price, "waiting");
  if (price > last * 1.25) return stall.walkAway(price);
  await stall.overBudget(price, last);
}

/** A voice with nothing to say: the channel posts its catalog phrases, with no Gemini call. */
const QUIET: BuyerVoice = { word: async () => null };

/**
 * The voice's words for a turn. With no voice, undefined: the channel words it its own way. With a
 * voice that has nothing to say (Gemini failed or was slow), "": the channel posts its catalog
 * phrase and doesn't try Gemini again, so a failure costs one call, not two.
 */
async function word(
  voice: BuyerVoice | undefined,
  turn: Parameters<BuyerVoice["word"]>[0],
): Promise<string | undefined> {
  if (!voice) return undefined;
  return (await voice.word(turn)) ?? "";
}
