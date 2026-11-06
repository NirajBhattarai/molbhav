import "server-only";
import {
  addLine,
  claimSeed,
  isBargainId,
  refreshChat,
  setOffer,
  type OpenStallMatch,
} from "@/lib/server/bargains";
import { shopperSays, type Turn } from "@/lib/server/ai-agent";
import { openHaggle, type BuyerVoice, type StallChannel } from "@/lib/server/buyer-agent";
import { geminiConfigured } from "@/lib/server/gemini";
import { query } from "@/lib/server/db";
import { HANDED_OFF, OVER_BUDGET } from "@/lib/offer-status";
import { decideStallCounter, stallSettles } from "@/lib/server/stall-agent";
import { rupees } from "@/lib/want";

/*
 * In-app negotiation: buyer brain (buyer-agent.ts) talks through a local StallChannel that
 * writes turns/offers and answers with stall-agent pricing. No A2A client yet.
 */

/** Seeds each matched stall: buyer agent haggles, then hands Agree to the buyer. */
export async function seedHaggle(
  bargainId: string,
  stalls: OpenStallMatch[],
  budget: number | null,
) {
  await Promise.all(
    stalls.map((s) =>
      seedOne(bargainId, s, budget)
        .then(() => refreshChat(bargainId, s.stallId))
        .catch((err) => console.error("seedHaggle", bargainId, s.stallId, err)),
    ),
  );
}

async function seedOne(bargainId: string, s: OpenStallMatch, budget: number | null) {
  if (!(await claimSeed(bargainId, s.stallId))) return;

  const talk = new LocalTalk(bargainId, s);
  try {
    await openHaggle(talk.channel(), budget, talk.voice());
  } catch (err) {
    if (err instanceof Aborted) return;
    throw err;
  }
}

/** Offer moved on (buyer agreed elsewhere): stop this seed quietly. */
class Aborted extends Error {}

/**
 * One in-app talk with one stall: catalog (or Gemini) lines into turns, stall prices from
 * stall-agent.ts.
 */
class LocalTalk {
  private asking: number;
  private readonly floor: number;
  private counters = 0;
  private lastTarget: number | undefined;
  private agentOffer: number | null = null;
  private readonly turns: Turn[] = [];
  private lastStallText = "";

  constructor(
    private readonly bargainId: string,
    private readonly s: OpenStallMatch,
  ) {
    this.asking = s.price;
    this.floor = s.lowest;
  }

  private ids = () =>
    ({ bargainId: this.bargainId, stallId: this.s.stallId, ifHaggling: true }) as const;

  private async line(
    speaker: "agent" | "stall",
    opts: {
      msg?: string;
      vars?: Record<string, string>;
      text?: string;
      status?: "haggling" | "waiting" | "declined" | "agreed";
      current: number | null;
    },
  ) {
    const ok = await addLine({
      ...this.ids(),
      speaker,
      msg: opts.msg,
      vars: opts.vars,
      text: opts.text,
      status: opts.status ?? "haggling",
      current: opts.current,
    });
    if (!ok) throw new Aborted();
    const shown =
      opts.text ??
      (opts.msg
        ? opts.msg.replace(/\{(\w+)\}/g, (_, k: string) => opts.vars?.[k] ?? `{${k}}`)
        : "");
    if (shown) {
      this.turns.push({ from: speaker === "stall" ? "stall" : "buyer", text: shown });
      if (speaker === "stall") this.lastStallText = shown;
    }
  }

  private async offer(patch: {
    status?: "haggling" | "declined";
    asked?: number | null;
    current?: number | null;
    agentOffer?: number | null;
  }) {
    const ok = await setOffer({
      ...this.ids(),
      status: patch.status ?? "haggling",
      asked: patch.asked,
      current: patch.current,
      agentOffer: patch.agentOffer,
    });
    if (!ok) throw new Aborted();
  }

  /** Hand the yes to the buyer: chat shows Agree after this. */
  private async handOff(price: number) {
    this.agentOffer = price;
    await this.offer({ current: price, agentOffer: price });
    await this.line("agent", {
      msg: HANDED_OFF,
      vars: { price: rupees(price) },
      current: price,
    });
  }

  voice(): BuyerVoice | undefined {
    if (!geminiConfigured()) return undefined;
    const items = this.s.itemName;
    return {
      word: async (turn) => {
        const spoken = await shopperSays({
          intent: turn.intent,
          items,
          asking: turn.theirs,
          ask: turn.mine,
          turns: this.turns,
          stallSaid: this.lastStallText || undefined,
        });
        return spoken?.line ?? null;
      },
    };
  }

  channel(): StallChannel {
    return {
      greet: async () => {
        await this.line("stall", {
          msg: "Welcome to {shop}! Here's what we have today:\n\n{menu}",
          vars: {
            shop: this.s.stallName,
            menu: `• ${this.s.itemName}: ${rupees(this.s.price)}`,
          },
          status: "waiting",
          current: null,
        });
        return true;
      },

      askPrice: async () => {
        await this.line("agent", {
          msg: "Namaste! I'm buying a {item} for someone nearby. What's your price?",
          vars: { item: this.s.itemName.toLowerCase() },
          status: "waiting",
          current: null,
        });
        const ask = this.s.price;
        this.asking = ask;
        await this.line("stall", {
          msg: "Very good quality, handmade. {price}.",
          vars: { price: rupees(ask) },
          status: "waiting",
          current: ask,
        });
        await this.offer({ asked: ask, current: ask });
        return { totalInr: ask };
      },

      counter: async (mine, theirs, opts) => {
        this.agentOffer = mine;
        // Non-empty line = Gemini; undefined/"" = catalog ("" means AI failed once — don't retry).
        if (opts?.line) {
          await this.line("agent", { text: opts.line, current: theirs });
        } else {
          await this.line("agent", {
            msg: "Other stalls here are lower. Can you do {price}?",
            vars: { price: rupees(mine) },
            current: theirs,
          });
        }

        const settled = stallSettles({
          asking: this.asking,
          floor: this.floor,
          counters: this.counters,
          target: mine,
          final: opts?.final,
        });
        const priced =
          settled ??
          decideStallCounter({
            ask: this.s.price,
            asking: this.asking,
            floor: this.floor,
            counters: this.counters,
            lastTarget: this.lastTarget,
            style: this.s.style,
            target: mine,
          });
        this.lastTarget = mine;
        this.counters += 1;
        this.asking = priced.totalInr;
        // Stall's spoken reply is posted by stallSaid / deal.
        await this.offer({ current: priced.totalInr, agentOffer: mine });
        return { totalInr: priced.totalInr, final: priced.final };
      },

      deal: async (theirs) => {
        await this.line("stall", {
          msg: "Okay, {price}. Deal.",
          vars: { price: rupees(theirs) },
          current: theirs,
        });
        await this.handOff(theirs);
      },

      agree: async (theirs) => {
        await this.handOff(theirs);
      },

      stallSaid: async (theirs, kind) => {
        await this.line("stall", {
          msg: "No, no. {price}, last price.",
          vars: { price: rupees(theirs) },
          status: kind === "waiting" ? "waiting" : "haggling",
          current: theirs,
        });
        this.asking = theirs;
        await this.offer({ current: theirs });
      },

      walkAway: async (price) => {
        await this.line("agent", {
          msg: "That's well over your budget. I'll leave this stall.",
          status: "declined",
          current: price,
        });
        await this.offer({ status: "declined", current: price });
      },

      overBudget: async (price, limit) => {
        await this.line("agent", {
          msg: OVER_BUDGET,
          vars: { price: rupees(price), amount: rupees(price - limit) },
          current: price,
        });
        await this.offer({ current: price, agentOffer: this.agentOffer });
      },

      standingOffer: () => (this.asking > 0 ? this.asking : null),
      current: () => this.asking,
    };
  }
}

/** Offers that still need seeding (asked is null). */
export async function pendingMatches(bargainId: string): Promise<OpenStallMatch[]> {
  if (!isBargainId(bargainId)) return [];
  return query<OpenStallMatch>(
    `SELECT o.stall_id AS "stallId", o.item_id AS "itemId", i.name AS "itemName",
            i.price, i.lowest, s.style, s.name AS "stallName", s.lang AS "stallLang"
     FROM offers o
     JOIN stall_items i ON i.id = o.item_id
     JOIN stalls s ON s.id = o.stall_id
     WHERE o.bargain_id = $1::uuid AND o.asked IS NULL AND o.status = 'haggling'`,
    [bargainId],
  );
}
