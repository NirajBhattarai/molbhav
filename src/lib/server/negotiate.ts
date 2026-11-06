import "server-only";
import {
  addLine,
  claimSeed,
  isBargainId,
  setOffer,
  type OpenStallMatch,
} from "@/lib/server/bargains";
import { HANDED_OFF } from "@/lib/offer-status";
import { query } from "@/lib/server/db";
import { rupees } from "@/lib/want";

/**
 * Local first-pass negotiation (no A2A yet): each stall answers with a price between
 * ask and floor, the buyer's agent counters, then hands the deal to the buyer to Agree.
 */
export async function seedHaggle(
  bargainId: string,
  stalls: OpenStallMatch[],
  budget: number | null,
) {
  await Promise.all(
    stalls.map((s) =>
      seedOne(bargainId, s, budget).catch((err) =>
        console.error("seedHaggle", bargainId, s.stallId, err),
      ),
    ),
  );
}

async function seedOne(bargainId: string, s: OpenStallMatch, budget: number | null) {
  // Only one caller seeds each offer: the background job after redirect, or the page as fallback.
  if (!(await claimSeed(bargainId, s.stallId))) return;

  const ask = s.price;
  const floor = s.lowest;
  const room = ask - floor;
  const drop = s.style === "firm" ? Math.round(room * 0.25) : Math.round(room * 0.45);
  let price = Math.max(floor, ask - drop);
  if (budget !== null && price > budget && floor <= budget) {
    price = Math.max(floor, budget);
  }

  // Every write stops the seed if the buyer agreed elsewhere and this offer was declined meanwhile.
  const ids = { bargainId, stallId: s.stallId, ifHaggling: true } as const;
  const say = (
    speaker: "agent" | "stall",
    msg: string,
    vars: Record<string, string>,
    current: number | null,
  ) => addLine({ ...ids, speaker, msg, vars, status: "haggling", current });

  if (
    !(await say(
      "agent",
      "Namaste! I'm buying a {item} for someone nearby. What's your price?",
      { item: s.itemName.toLowerCase() },
      null,
    ))
  )
    return;
  if (!(await say("stall", "Very good quality, handmade. {price}.", { price: rupees(ask) }, ask)))
    return;
  if (!(await setOffer({ ...ids, status: "haggling", asked: ask, current: ask }))) return;

  if (price < ask) {
    if (
      !(await say(
        "agent",
        "Other stalls here are lower. Can you do {price}?",
        { price: rupees(price) },
        ask,
      ))
    )
      return;
    if (!(await say("stall", "No, no. {price}, last price.", { price: rupees(price) }, price)))
      return;
    if (!(await setOffer({ ...ids, status: "haggling", current: price, agentOffer: price })))
      return;
  }

  if (budget !== null && price > budget) {
    await say(
      "agent",
      "{price} is their last price, {amount} over your budget. Tell me if you can go higher.",
      { price: rupees(price), amount: rupees(price - budget) },
      price,
    );
    return;
  }

  await say("agent", HANDED_OFF, { price: rupees(price) }, price);
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
