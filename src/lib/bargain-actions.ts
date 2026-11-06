"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isLang, type Lang } from "@/lib/languages";
import { capped } from "@/lib/limits";
import {
  agreeOfferFor,
  ensureUser,
  isBargainId,
  me,
  openBargain,
  refreshChat,
  type OpenStallMatch,
} from "@/lib/server/bargains";
import { claimPay, orderForBuyer, payFailed, stopOrder } from "@/lib/server/auto-order";
import { wroteChat } from "@/lib/server/chat-cache";
import { decideBargain } from "@/lib/server/decide-bargain";
import { query } from "@/lib/server/db";
import { getLimits, payingBreaks } from "@/lib/server/limits";
import { seedHaggle } from "@/lib/server/negotiate";
import { MAX_STALLS, pickStalls, scopeFrom, understandWant } from "@/lib/server/want";
import { matchMenu, parseHeard, type MenuRow } from "@/lib/want";

/** Home "Start bargaining": open a bargain against the nearest few matching stalls, then haggle. */
export async function createBargain(form: FormData) {
  const want = String(form.get("q") ?? "")
    .trim()
    .slice(0, 200);
  if (!want) redirect("/");
  const langRaw = String(form.get("lang") ?? "en");
  const buyerLang: Lang = isLang(langRaw) ? langRaw : "en";
  const user = await me();
  await ensureUser(user);

  const scope = scopeFrom(form);
  // The sheet already understood this order; only ask again if what it sent doesn't parse. The
  // stalls are always picked here: the browser's list is never trusted, and the phone may know
  // where it is by now even if it didn't when the order was read.
  const sent = parseHeard(form.get("heard"));
  const heard = sent
    ? { ...sent, stalls: await pickStalls(sent.lines, scope) }
    : await understandWant(want, buyerLang, scope);
  const title = heard.items.slice(0, 3).join(", ") || want.slice(0, 60);
  const stalls = await matchesFor(heard.english || want, heard.stalls);

  const limits = await getLimits(user.id);
  const budget = capped(heard.budget, limits);
  const autoAgree = limits.autoAgree;
  const autoOrder = autoAgree && limits.autoOrder;

  const id = await openBargain({
    buyerId: user.id,
    want,
    title,
    budget,
    buyerLang,
    stalls,
    autoAgree,
    autoOrder,
  });

  after(async () => {
    await seedHaggle(id, stalls, budget);
    await decideBargain(id, user.id).catch((err) => console.error("decideBargain", id, err));
    if (autoOrder) {
      await orderForBuyer(user.id, id).catch((err) => console.error("orderForBuyer", id, err));
    }
  });
  redirect(`/bargains/${id}`);
}

async function matchesFor(
  english: string,
  heardStalls: { id: string; item: string }[],
): Promise<OpenStallMatch[]> {
  if (!heardStalls.length) return [];
  const rows = await query<
    MenuRow & {
      lowest: number;
      style: "friendly" | "firm";
      lang: Lang;
      agentId: string | null;
      ensLabel: string | null;
    }
  >(
    `SELECT i.id, i.stall_id AS "stallId", s.name AS "stallName", i.name, i.words, i.price,
            i.lowest, s.style, s.lang, s.agent_id AS "agentId",
            CASE WHEN s.ens_status = 'live' THEN s.ens_label END AS "ensLabel"
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
      agentId: full.agentId,
      ensLabel: full.ensLabel,
      itemId: full.id,
      itemName: full.name,
      price: full.price,
      lowest: full.lowest,
      style: full.style,
      stallName: full.stallName,
      stallLang: full.lang,
    });
  }
  return [...byStall.values()].slice(0, MAX_STALLS);
}

/** Buyer agrees to the held price on this stall. */
export async function agreeOffer(bargainId: string, stallId: string) {
  if (!isBargainId(bargainId)) return;
  const user = await me();
  const [row] = await query<{ current: number | null }>(
    `SELECT o.current FROM offers o JOIN bargains b ON b.id = o.bargain_id
     WHERE o.bargain_id = $1::uuid AND o.stall_id = $2 AND b.buyer_id = $3
       AND o.status = 'haggling'`,
    [bargainId, stallId, user.id],
  );
  if (row?.current != null && (await payingBreaks(user.id, row.current))) return;
  const price = await agreeOfferFor(user.id, bargainId, stallId);
  if (price == null) return;
  revalidatePath(`/bargains/${bargainId}`);
  revalidatePath(`/bargains/${bargainId}/${stallId}`);
}

/** Soft confirm: buyer says they've paid by UPI / cash. */
export async function markPaid(bargainId: string, stallId: string) {
  if (!isBargainId(bargainId)) return;
  const user = await me();
  const [row] = await query<{ current: number | null }>(
    `SELECT o.current FROM offers o JOIN bargains b ON b.id = o.bargain_id
     WHERE o.bargain_id = $1::uuid AND o.stall_id = $2 AND b.buyer_id = $3
       AND o.status = 'agreed'`,
    [bargainId, stallId, user.id],
  );
  if (row?.current != null && (await payingBreaks(user.id, row.current))) return;

  const [paid] = await query<{ version: number }>(
    `UPDATE offers o SET status = 'paid', version = o.version + 1, updated_at = now()
     FROM bargains b
     WHERE b.id = o.bargain_id AND b.buyer_id = $3
       AND o.bargain_id = $1::uuid AND o.stall_id = $2 AND o.status = 'agreed'
     RETURNING o.version`,
    [bargainId, stallId, user.id],
  );
  if (paid) {
    await wroteChat(bargainId, stallId, paid.version);
    await refreshChat(bargainId, stallId);
  }
  revalidatePath(`/bargains/${bargainId}`);
  revalidatePath(`/bargains/${bargainId}/${stallId}`);
}

/** Buyer stops the auto-order countdown on this bargain. */
export async function stopAutoOrder(bargainId: string) {
  if (!isBargainId(bargainId)) return;
  const user = await me();
  await stopOrder(user.id, bargainId);
  revalidatePath(`/bargains/${bargainId}`);
}

/**
 * The countdown ended on the buyer's screen: may their agent pay now? Claims the payment once and
 * returns the deal to pay with the buyer's Magic wallet, or null.
 */
export async function claimAgentPay(bargainId: string) {
  if (!isBargainId(bargainId)) return null;
  const user = await me();
  const deal = await claimPay(user.id, bargainId);
  if (!deal) revalidatePath(`/bargains/${bargainId}`);
  return deal;
}

/** The buyer's wallet couldn't pay what the agent claimed; record why so the buyer can pay. */
export async function agentPayFailed(bargainId: string, payError: string, payAccount?: string) {
  if (!isBargainId(bargainId)) return;
  const user = await me();
  await payFailed(user.id, bargainId, payError, payAccount);
  revalidatePath(`/bargains/${bargainId}`);
}
