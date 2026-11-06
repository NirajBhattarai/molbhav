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
import { appClient, A2aCallError, type A2aClient, type StallCard } from "@/lib/server/a2a/client";
import { openHaggle, type BuyerVoice, type StallChannel } from "@/lib/server/buyer-agent";
import { geminiConfigured } from "@/lib/server/gemini";
import { query } from "@/lib/server/db";
import { HANDED_OFF, OVER_BUDGET } from "@/lib/offer-status";
import type { Offer, StallReply } from "@/lib/a2a/protocol";
import { ensName } from "@/lib/ens";
import { cardFromEns } from "@/lib/server/ens";
import { rupees } from "@/lib/want";

/*
 * In-app negotiation: buyer brain (buyer-agent.ts) talks through an A2A StallChannel that
 * calls stall agents over JSON-RPC (same path outside agents use) and writes turns/offers.
 */

/** Seeds each matched stall: buyer agent haggles over A2A, then hands Agree to the buyer. */
export async function seedHaggle(
  bargainId: string,
  stalls: OpenStallMatch[],
  budget: number | null,
) {
  const client = appClient();
  await Promise.all(
    stalls.map((s) =>
      seedOne(client, bargainId, s, budget)
        .then(() => refreshChat(bargainId, s.stallId))
        .catch((err) => console.error("seedHaggle", bargainId, s.stallId, err)),
    ),
  );
}

async function seedOne(
  client: A2aClient,
  bargainId: string,
  s: OpenStallMatch,
  budget: number | null,
) {
  if (!(await claimSeed(bargainId, s.stallId))) return;

  if (!s.agentId) {
    await declineStall(bargainId, s.stallId, "This stall isn’t on A2A yet.");
    return;
  }

  let talk: A2aTalk;
  try {
    const stall = await findStall(client, s as OpenStallMatch & { agentId: string });
    talk = new A2aTalk(client, bargainId, s, stall);
  } catch (err) {
    const reason = err instanceof A2aCallError ? err.message : "Couldn’t reach this stall’s agent.";
    console.error("seedHaggle card", bargainId, s.stallId, err);
    await declineStall(bargainId, s.stallId, reason);
    return;
  }

  try {
    await openHaggle(talk.channel(), budget, talk.voice());
  } catch (err) {
    if (err instanceof Aborted) return;
    console.error("seedHaggle talk", bargainId, s.stallId, err);
    await declineStall(bargainId, s.stallId, "This stall didn’t answer.").catch(() => {});
  }
}

async function declineStall(bargainId: string, stallId: string, reason: string) {
  const ids = { bargainId, stallId, ifHaggling: true } as const;
  await addLine({
    ...ids,
    speaker: "stall",
    text: reason,
    status: "declined",
    current: null,
  });
  await setOffer({ ...ids, status: "declined", current: null });
}

/**
 * The stall's agent, found the way an outside buyer's agent would: by its ENS name, whose
 * agent-endpoint[a2a] record is the Agent Card, and whose card names it back. Falls back to the
 * agent id when the stall has no name yet or the name doesn't check out.
 */
async function findStall(
  client: A2aClient,
  s: OpenStallMatch & { agentId: string },
): Promise<StallCard> {
  if (s.ensLabel) {
    const name = ensName(s.ensLabel);
    try {
      const card = await cardFromEns(name);
      if (card) {
        const stall = await client.stall(card);
        if (stall.agentId === s.agentId && stall.ens === name) return stall;
        console.warn("seedHaggle ens mismatch", name, stall.agentId, stall.ens);
      }
    } catch (err) {
      console.warn("seedHaggle ens lookup", name, err);
    }
  }
  return client.stallById(s.agentId);
}

/** Offer moved on (buyer agreed elsewhere): stop this seed quietly. */
class Aborted extends Error {}

type OfferReply = Extract<StallReply, { type: "offer" }>;

/**
 * One in-app talk with one stall agent over A2A: catalog/Gemini lines into turns, prices from
 * the stall's JSON-RPC replies.
 */
class A2aTalk {
  private taskId: string | null = null;
  private latest: Offer | null = null;
  private lastOfferReply: OfferReply | null = null;
  private asking: number | null = null;
  private agentOffer: number | null = null;
  private readonly turns: Turn[] = [];
  private lastStallText = "";

  constructor(
    private readonly client: A2aClient,
    private readonly bargainId: string,
    private readonly s: OpenStallMatch,
    private readonly stall: StallCard,
  ) {}

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

  private async handOff(price: number) {
    this.agentOffer = price;
    await this.offer({ current: price, agentOffer: price });
    await this.line("agent", {
      msg: HANDED_OFF,
      vars: { price: rupees(price) },
      current: price,
    });
  }

  private menuLines(menu: StallCard["menu"]) {
    return menu
      .slice(0, 8)
      .map((m) => `• ${m.name}: ${rupees(m.priceInr)}`)
      .join("\n");
  }

  private async send(intent: Parameters<A2aClient["send"]>[1], text?: string) {
    const { task, reply } = await this.client.send(this.stall, intent, {
      taskId: this.taskId ?? undefined,
      contextId: this.bargainId,
      text,
    });
    if (!this.taskId) this.taskId = task.id;
    if (reply?.type === "offer") {
      this.latest = reply.offer;
      this.lastOfferReply = reply;
      this.asking = reply.offer.totalInr;
    }
    return reply;
  }

  private async acceptLatest(theirs: number) {
    const offer = this.latest;
    if (!offer || offer.totalInr !== theirs)
      throw new Error("no stall offer to accept at that price");
    const reply = await this.send({ type: "accept", offerId: offer.offerId });
    if (reply?.type !== "deal") throw new Error("the stall agent didn’t take its own offer");
  }

  private async stallNote(
    reply: { note?: string; said?: Record<string, string> },
    fallback: string,
  ) {
    const text = reply.said?.en?.trim() || reply.note?.trim() || fallback;
    await this.line("stall", { text, status: "waiting", current: this.asking });
  }

  voice(): BuyerVoice | undefined {
    if (!geminiConfigured()) return undefined;
    const items = `1 × ${this.s.itemName}`;
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
        const reply = await this.send({ type: "hello", languages: ["en", this.s.stallLang] });
        if (reply?.type !== "welcome") {
          const reason = reply?.type === "no-offer" ? reply.reason : "This stall isn’t open.";
          await this.line("stall", { text: reason, status: "declined", current: null });
          await this.offer({ status: "declined", current: null });
          return false;
        }
        const menu = this.menuLines(reply.menu.length ? reply.menu : this.stall.menu);
        const fallback = `Welcome to ${this.stall.name}! Here's what we have today:\n\n${menu}`;
        const welcome = reply.said?.en?.trim() || reply.note?.trim() || fallback;
        const withMenu = welcome.includes(menu) || !menu ? welcome : `${welcome}\n\n${menu}`;
        await this.line("stall", { text: withMenu, status: "waiting", current: null });
        return true;
      },

      askPrice: async () => {
        await this.line("agent", {
          msg: "Namaste! I'm buying a {item} for someone nearby. What's your price?",
          vars: { item: this.s.itemName.toLowerCase() },
          status: "waiting",
          current: null,
        });
        const reply = await this.send(
          {
            type: "rfq",
            basket: [{ item: this.s.itemName, qty: 1 }],
            languages: ["en", this.s.stallLang],
          },
          `Namaste! I'm buying a ${this.s.itemName.toLowerCase()} for someone nearby. What's your price?`,
        );
        if (reply?.type !== "offer") {
          const reason = reply?.type === "no-offer" ? reply.reason : "No offer.";
          await this.line("stall", { text: reason, status: "declined", current: null });
          await this.offer({ status: "declined", current: null });
          return null;
        }
        const ask = reply.offer.totalInr;
        this.asking = ask;
        await this.stallNote(reply, `Very good quality, handmade. ${rupees(ask)}.`);
        await this.offer({ asked: ask, current: ask });
        return { totalInr: ask };
      },

      counter: async (mine, theirs, opts) => {
        this.agentOffer = mine;
        let text: string | undefined;
        if (opts?.line) {
          await this.line("agent", { text: opts.line, current: theirs });
          text = opts.line;
        } else {
          await this.line("agent", {
            msg: "Other stalls here are lower. Can you do {price}?",
            vars: { price: rupees(mine) },
            current: theirs,
          });
          text = `Other stalls here are lower. Can you do ${rupees(mine)}?`;
        }
        await this.offer({ current: theirs, agentOffer: mine });

        const reply = await this.send(
          {
            type: "counter",
            targetInr: mine,
            languages: ["en", this.s.stallLang],
            ...(opts?.final && { final: true }),
          },
          text,
        );
        if (reply?.type !== "offer") return null;
        this.asking = reply.offer.totalInr;
        await this.offer({ current: reply.offer.totalInr, agentOffer: mine });
        // Spoken stall reply is posted by stallSaid / deal.
        return { totalInr: reply.offer.totalInr, final: !!reply.final };
      },

      deal: async (theirs) => {
        await this.acceptLatest(theirs);
        await this.line("stall", {
          msg: "Okay, {price}. Deal.",
          vars: { price: rupees(theirs) },
          current: theirs,
        });
        await this.handOff(theirs);
      },

      agree: async (theirs) => {
        await this.acceptLatest(theirs);
        await this.handOff(theirs);
      },

      stallSaid: async (theirs, kind) => {
        const fromA2a =
          this.lastOfferReply && this.lastOfferReply.offer.totalInr === theirs
            ? this.lastOfferReply.said?.en?.trim() || this.lastOfferReply.note?.trim()
            : undefined;
        if (fromA2a) {
          await this.line("stall", {
            text: fromA2a,
            status: kind === "waiting" ? "waiting" : "haggling",
            current: theirs,
          });
        } else {
          await this.line("stall", {
            msg: "No, no. {price}, last price.",
            vars: { price: rupees(theirs) },
            status: kind === "waiting" ? "waiting" : "haggling",
            current: theirs,
          });
        }
        this.asking = theirs;
        await this.offer({ current: theirs });
      },

      walkAway: async (price) => {
        await this.send({ type: "decline" }).catch(() => null);
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

      standingOffer: () =>
        this.latest && Date.parse(this.latest.validUntil) > Date.now() + 5_000
          ? this.latest.totalInr
          : this.asking,

      current: () => this.asking,
    };
  }
}

/** Offers that still need seeding (asked is null). */
export async function pendingMatches(bargainId: string): Promise<OpenStallMatch[]> {
  if (!isBargainId(bargainId)) return [];
  return query<OpenStallMatch>(
    `SELECT o.stall_id AS "stallId", s.agent_id AS "agentId",
            CASE WHEN s.ens_status = 'live' THEN s.ens_label END AS "ensLabel",
            o.item_id AS "itemId",
            i.name AS "itemName", i.price, i.lowest, s.style, s.name AS "stallName",
            s.lang AS "stallLang"
     FROM offers o
     JOIN stall_items i ON i.id = o.item_id
     JOIN stalls s ON s.id = o.stall_id
     WHERE o.bargain_id = $1::uuid AND o.asked IS NULL AND o.status = 'haggling'`,
    [bargainId],
  );
}
