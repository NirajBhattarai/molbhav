import "server-only";
import { fillChat, readChat, wroteChat, type CachedChat } from "@/lib/server/chat-cache";
import { query } from "@/lib/server/db";
import { ensureUser, me, type Me } from "@/lib/server/shop";
import type { Lang } from "@/lib/languages";
import type { OfferStatus } from "@/lib/offer-status";
import { rupees } from "@/lib/want";

export type { Me };
export { me, ensureUser };

export type StallBrief = { id: string; name: string; lang: Lang };

export type OfferView = {
  stall: StallBrief;
  item: string;
  status: OfferStatus;
  asked: number | null;
  current: number | null;
  pending: boolean;
};

export type BargainView = {
  id: string;
  want: string;
  title: string;
  budget: number | null;
  minutesAgo: number;
  offers: OfferView[];
};

export type TurnView = {
  id: string;
  speaker: "agent" | "stall" | "buyer";
  msg: string | null;
  vars: Record<string, string> | null;
  text: string | null;
  amount: number | null;
};

export type ChatView = {
  bargainId: string;
  title: string;
  budget: number | null;
  stall: StallBrief;
  item: string;
  status: OfferStatus;
  asked: number | null;
  current: number | null;
  turns: TurnView[];
  /** Who is expected next while agents are mid-exchange. */
  next: "agent" | "stall" | null;
};

const BARGAIN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A well-formed bargain id: anything else is a 404, not a Postgres cast error. */
export const isBargainId = (id: string) => BARGAIN_ID.test(id);

function ago(created: Date) {
  return Math.max(0, Math.round((Date.now() - created.getTime()) / 60_000));
}

/** Buyer's bargains, newest first. */
export async function myBargains(user: Me): Promise<BargainView[]> {
  const rows = await query<{
    id: string;
    want: string;
    title: string;
    budget: number | null;
    created_at: Date;
  }>(
    `SELECT id, want, title, budget, created_at
     FROM bargains WHERE buyer_id = $1
     ORDER BY created_at DESC LIMIT 40`,
    [user.id],
  );
  if (!rows.length) return [];
  const offers = await offersFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    want: r.want,
    title: r.title,
    budget: r.budget,
    minutesAgo: ago(r.created_at),
    offers: offers.get(r.id) ?? [],
  }));
}

/** One bargain the buyer owns. */
export async function myBargain(user: Me, id: string): Promise<BargainView | null> {
  if (!isBargainId(id)) return null;
  const [row] = await query<{
    id: string;
    want: string;
    title: string;
    budget: number | null;
    created_at: Date;
  }>(
    `SELECT id, want, title, budget, created_at
     FROM bargains WHERE id = $1::uuid AND buyer_id = $2`,
    [id, user.id],
  );
  if (!row) return null;
  const offers = await offersFor([row.id]);
  return {
    id: row.id,
    want: row.want,
    title: row.title,
    budget: row.budget,
    minutesAgo: ago(row.created_at),
    offers: offers.get(row.id) ?? [],
  };
}

async function offersFor(bargainIds: string[]) {
  if (!bargainIds.length) return new Map<string, OfferView[]>();
  const rows = await query<{
    bargain_id: string;
    stall_id: string;
    stall_name: string;
    stall_lang: Lang;
    item_name: string;
    status: OfferStatus;
    asked: number | null;
    current: number | null;
  }>(
    `SELECT o.bargain_id, o.stall_id, s.name AS stall_name, s.lang AS stall_lang,
            i.name AS item_name, o.status, o.asked, o.current
     FROM offers o
     JOIN stalls s ON s.id = o.stall_id
     JOIN stall_items i ON i.id = o.item_id
     WHERE o.bargain_id = ANY($1::uuid[])
     ORDER BY o.updated_at DESC`,
    [bargainIds],
  );
  const map = new Map<string, OfferView[]>();
  for (const r of rows) {
    const list = map.get(r.bargain_id) ?? [];
    list.push({
      stall: { id: r.stall_id, name: r.stall_name, lang: r.stall_lang },
      item: r.item_name,
      status: r.current === null && r.status === "haggling" ? "waiting" : r.status,
      asked: r.asked,
      current: r.current,
      pending: r.current === null && r.status === "haggling",
    });
    map.set(r.bargain_id, list);
  }
  return map;
}

/** Chat for one stall offer in a bargain the buyer owns. Redis first, then Postgres. */
export async function myChat(
  user: Me,
  bargainId: string,
  stallId: string,
): Promise<ChatView | null> {
  if (!isBargainId(bargainId)) return null;
  const hit = await readChat<ChatView>(bargainId, stallId);
  const found = hit ?? (await loadChat(bargainId, stallId));
  if (!found) return null;
  if (!hit) await fillChat(bargainId, stallId, found);
  return found.buyerId === user.id ? found.chat : null;
}

/** Reads the chat again from Postgres and copies it into Redis: call after a whole step. */
export async function refreshChat(bargainId: string, stallId: string) {
  const fresh = await loadChat(bargainId, stallId);
  if (fresh) await fillChat(bargainId, stallId, fresh);
}

async function loadChat(bargainId: string, stallId: string): Promise<CachedChat<ChatView> | null> {
  const [row] = await query<{
    bargain_id: string;
    buyer_id: string;
    title: string;
    budget: number | null;
    stall_id: string;
    stall_name: string;
    stall_lang: Lang;
    item_name: string;
    status: OfferStatus;
    asked: number | null;
    current: number | null;
    version: number;
  }>(
    `SELECT b.id AS bargain_id, b.buyer_id, b.title, b.budget,
            o.stall_id, s.name AS stall_name, s.lang AS stall_lang,
            i.name AS item_name, o.status, o.asked, o.current, o.version
     FROM bargains b
     JOIN offers o ON o.bargain_id = b.id
     JOIN stalls s ON s.id = o.stall_id
     JOIN stall_items i ON i.id = o.item_id
     WHERE b.id = $1::uuid AND o.stall_id = $2`,
    [bargainId, stallId],
  );
  if (!row) return null;

  const turns = await query<{
    id: string;
    speaker: "agent" | "stall" | "buyer";
    msg: string | null;
    vars: Record<string, string> | null;
    text: string | null;
    current: number | null;
  }>(
    `SELECT id::text, speaker, msg, vars, text, current
     FROM turns
     WHERE bargain_id = $1::uuid AND stall_id = $2
     ORDER BY at ASC, id ASC`,
    [bargainId, stallId],
  );

  const status: OfferStatus =
    row.current === null && row.status === "haggling" ? "waiting" : row.status;
  const next =
    status === "waiting"
      ? ("stall" as const)
      : status === "haggling" && !turns.length
        ? ("agent" as const)
        : null;

  return {
    buyerId: row.buyer_id,
    version: row.version,
    chat: {
      bargainId: row.bargain_id,
      title: row.title,
      budget: row.budget,
      stall: { id: row.stall_id, name: row.stall_name, lang: row.stall_lang },
      item: row.item_name,
      status,
      asked: row.asked,
      current: row.current,
      turns: turns.map((t) => ({
        id: t.id,
        speaker: t.speaker,
        msg: t.msg,
        vars: t.vars,
        text: t.text,
        amount: t.current,
      })),
      next,
    },
  };
}

export type OpenStallMatch = {
  stallId: string;
  itemId: number;
  itemName: string;
  price: number;
  lowest: number;
  style: "friendly" | "firm";
  stallName: string;
  stallLang: Lang;
};

/** Persist a new bargain + empty offers; negotiation fills prices after. */
export async function openBargain(input: {
  buyerId: string;
  want: string;
  title: string;
  budget: number | null;
  buyerLang: Lang;
  stalls: OpenStallMatch[];
}): Promise<string> {
  const [b] = await query<{ id: string }>(
    `INSERT INTO bargains (buyer_id, want, title, budget, buyer_lang)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.buyerId, input.want, input.title, input.budget, input.buyerLang],
  );
  for (const s of input.stalls) {
    await query(
      `INSERT INTO offers (bargain_id, stall_id, item_id, status)
       VALUES ($1::uuid, $2, $3, 'haggling')`,
      [b.id, s.stallId, s.itemId],
    );
  }
  return b.id;
}

type LineInput = {
  bargainId: string;
  stallId: string;
  speaker: "agent" | "stall" | "buyer";
  msg?: string;
  vars?: Record<string, string>;
  text?: string;
  status: OfferStatus;
  current: number | null;
  /** Only write while the offer is still haggling (the seed must not talk past an Agree). */
  ifHaggling?: boolean;
};

/** Adds one chat line. Returns false when `ifHaggling` and the offer has moved on. */
export async function addLine(input: LineInput): Promise<boolean> {
  // The insert and the version bump are one statement, so the cache always sees the new line.
  const rows = await query<{ version: number }>(
    `WITH line AS (
       INSERT INTO turns (bargain_id, stall_id, speaker, msg, vars, text, status, current)
       SELECT $1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8
       WHERE NOT $9::boolean OR EXISTS (
         SELECT 1 FROM offers
         WHERE bargain_id = $1::uuid AND stall_id = $2 AND status = 'haggling')
       RETURNING bargain_id, stall_id
     )
     UPDATE offers o SET version = o.version + 1
     FROM line
     WHERE o.bargain_id = line.bargain_id AND o.stall_id = line.stall_id
     RETURNING o.version`,
    [
      input.bargainId,
      input.stallId,
      input.speaker,
      input.msg ?? null,
      input.vars ? JSON.stringify(input.vars) : null,
      input.text ?? null,
      input.status === "waiting" ? "haggling" : input.status,
      input.current,
      input.ifHaggling ?? false,
    ],
  );
  if (!rows.length) return false;
  await wroteChat(input.bargainId, input.stallId, rows[0].version);
  return true;
}

/** Updates an offer. Returns false when `ifHaggling` and the offer has moved on. */
export async function setOffer(input: {
  bargainId: string;
  stallId: string;
  status: "haggling" | "declined" | "agreed" | "paid";
  asked?: number | null;
  current?: number | null;
  agentOffer?: number | null;
  ifHaggling?: boolean;
}): Promise<boolean> {
  const rows = await query<{ version: number }>(
    `UPDATE offers SET
       status = $3,
       asked = COALESCE($4, asked),
       current = COALESCE($5, current),
       agent_offer = COALESCE($6, agent_offer),
       version = version + 1,
       updated_at = now()
     WHERE bargain_id = $1::uuid AND stall_id = $2
       AND (NOT $7::boolean OR status = 'haggling')
     RETURNING version`,
    [
      input.bargainId,
      input.stallId,
      input.status,
      input.asked ?? null,
      input.current ?? null,
      input.agentOffer ?? null,
      input.ifHaggling ?? false,
    ],
  );
  if (!rows.length) return false;
  await wroteChat(input.bargainId, input.stallId, rows[0].version);
  return true;
}

/**
 * Claims an unseeded offer so only one caller writes its opening lines. A claim older than
 * 30 seconds with still no price is treated as a crashed seed: its partial lines are cleared
 * and it can be claimed again.
 */
export async function claimSeed(bargainId: string, stallId: string): Promise<boolean> {
  const [row] = await query<{ version: number }>(
    `UPDATE offers SET version = version + 1, updated_at = now()
     WHERE bargain_id = $1::uuid AND stall_id = $2
       AND status = 'haggling' AND asked IS NULL
       AND (version = 0 OR updated_at < now() - interval '30 seconds')
     RETURNING version`,
    [bargainId, stallId],
  );
  if (!row) return false;
  if (row.version > 1) {
    await query(`DELETE FROM turns WHERE bargain_id = $1::uuid AND stall_id = $2`, [
      bargainId,
      stallId,
    ]);
  }
  await wroteChat(bargainId, stallId, row.version);
  return true;
}

export { rupees };
