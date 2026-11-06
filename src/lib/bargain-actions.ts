"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isLang, type Lang } from "@/lib/languages";
import {
  addLine,
  ensureUser,
  isBargainId,
  me,
  openBargain,
  type OpenStallMatch,
} from "@/lib/server/bargains";
import { query } from "@/lib/server/db";
import { seedHaggle } from "@/lib/server/negotiate";
import { understandWant } from "@/lib/server/want";
import { matchMenu, parseHeard, rupees, type MenuRow } from "@/lib/want";

/** Home "Start bargaining": open a bargain against matching open stalls, then haggle. */
export async function createBargain(form: FormData) {
  const want = String(form.get("q") ?? "")
    .trim()
    .slice(0, 200);
  if (!want) redirect("/");
  const langRaw = String(form.get("lang") ?? "en");
  const buyerLang: Lang = isLang(langRaw) ? langRaw : "en";
  const user = await me();
  await ensureUser(user);

  // The sheet already understood this order; only ask again if what it sent doesn't parse.
  const heard = parseHeard(form.get("heard")) ?? (await understandWant(want, buyerLang));
  const title = heard.items.slice(0, 3).join(", ") || want.slice(0, 60);
  const stalls = await matchesFor(heard.english || want, heard.stalls);

  const id = await openBargain({
    buyerId: user.id,
    want,
    title,
    budget: heard.budget,
    buyerLang,
    stalls,
  });

  after(() => seedHaggle(id, stalls, heard.budget));
  redirect(`/bargains/${id}`);
}

async function matchesFor(
  english: string,
  heardStalls: { id: string; item: string }[],
): Promise<OpenStallMatch[]> {
  if (!heardStalls.length) return [];
  const rows = await query<MenuRow & { lowest: number; style: "friendly" | "firm"; lang: Lang }>(
    `SELECT i.id, i.stall_id AS "stallId", s.name AS "stallName", i.name, i.words, i.price,
            i.lowest, s.style, s.lang
     FROM stall_items i
     JOIN stalls s ON s.id = i.stall_id
     WHERE i.active AND s.is_open AND s.id = ANY($1::text[])`,
    [heardStalls.map((h) => h.id)],
  );

  const byStall = new Map<string, OpenStallMatch>();
  for (const { id, item } of heardStalls) {
    const menu = rows.filter((r) => r.stallId === id);
    // The item the agent already matched for this stall, else a word match. Never a random item.
    const full =
      menu.find((r) => r.name.toLowerCase() === item.trim().toLowerCase()) ??
      (matchMenu(menu, english) as (typeof menu)[number] | null);
    if (!full) continue;
    byStall.set(id, {
      stallId: id,
      itemId: full.id,
      itemName: full.name,
      price: full.price,
      lowest: full.lowest,
      style: full.style,
      stallName: full.stallName,
      stallLang: full.lang,
    });
  }
  return [...byStall.values()].slice(0, 8);
}

/** Buyer agrees to the held price on this stall. */
export async function agreeOffer(bargainId: string, stallId: string) {
  if (!isBargainId(bargainId)) return;
  const user = await me();

  // One statement checks and sets, so a double tap can't agree twice. The partial unique index
  // `offers_one_deal` rejects a second deal on the same bargain from another stall's chat.
  let won: { current: number }[];
  try {
    won = await query<{ current: number }>(
      `UPDATE offers o SET status = 'agreed', version = o.version + 1, updated_at = now()
       FROM bargains b
       WHERE b.id = o.bargain_id AND b.buyer_id = $3
         AND o.bargain_id = $1::uuid AND o.stall_id = $2
         AND o.status = 'haggling' AND o.current IS NOT NULL
       RETURNING o.current`,
      [bargainId, stallId, user.id],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return; // another stall's deal won
    throw err;
  }
  if (!won.length) return;
  const price = won[0].current;

  await addLine({
    bargainId,
    stallId,
    speaker: "agent",
    msg: "I'll take this deal at {price}.",
    vars: { price: rupees(price) },
    status: "agreed",
    current: price,
  });
  await addLine({
    bargainId,
    stallId,
    speaker: "stall",
    msg: "Okay, {price}. Deal.",
    vars: { price: rupees(price) },
    status: "agreed",
    current: price,
  });

  // Decline the other offers still going. A seed still running on one of them sees it and stops.
  const others = await query<{ stall_id: string; current: number | null }>(
    `UPDATE offers SET status = 'declined', version = version + 1, updated_at = now()
     WHERE bargain_id = $1::uuid AND stall_id <> $2 AND status = 'haggling'
     RETURNING stall_id, current`,
    [bargainId, stallId],
  );
  for (const o of others) {
    await addLine({
      bargainId,
      stallId: o.stall_id,
      speaker: "agent",
      msg: "I found it cheaper at another stall. Thank you!",
      status: "declined",
      current: o.current,
    });
  }

  revalidatePath(`/bargains/${bargainId}`);
  revalidatePath(`/bargains/${bargainId}/${stallId}`);
}

/** Soft confirm: buyer says they've paid by UPI. */
export async function markPaid(bargainId: string, stallId: string) {
  if (!isBargainId(bargainId)) return;
  const user = await me();
  await query(
    `UPDATE offers o SET status = 'paid', version = o.version + 1, updated_at = now()
     FROM bargains b
     WHERE b.id = o.bargain_id AND b.buyer_id = $3
       AND o.bargain_id = $1::uuid AND o.stall_id = $2 AND o.status = 'agreed'`,
    [bargainId, stallId, user.id],
  );
  revalidatePath(`/bargains/${bargainId}`);
  revalidatePath(`/bargains/${bargainId}/${stallId}`);
}
