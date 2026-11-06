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

/** The newest chat line of an offer, for previews in lists. */
export type LastLine = {
  speaker: "agent" | "stall" | "buyer";
  msg: string | null;
  vars: Record<string, string> | null;
  text: string | null;
};

export type OfferView = {
  stall: StallBrief;
  item: string;
  status: OfferStatus;
  asked: number | null;
  current: number | null;
  pending: boolean;
  last: LastLine | null;
  /** Minutes since this offer last changed. */
  minutesAgo: number;
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
  /** Offer status after this line: marks where a deal was agreed or a stall said no. */
  status: OfferStatus;
  /** ISO time the line was written. */
  at: string;
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
    updated_at: Date;
    last_speaker: LastLine["speaker"] | null;
    last_msg: string | null;
    last_vars: Record<string, string> | null;
    last_text: string | null;
    last_at: Date | null;
  }>(
    `SELECT o.bargain_id, o.stall_id, s.name AS stall_name, s.lang AS stall_lang,
            i.name AS item_name, o.status, o.asked, o.current, o.updated_at,
            l.speaker AS last_speaker, l.msg AS last_msg, l.vars AS last_vars,
            l.text AS last_text, l.at AS last_at
     FROM offers o
     JOIN stalls s ON s.id = o.stall_id
     JOIN stall_items i ON i.id = o.item_id
     LEFT JOIN LATERAL (
       SELECT speaker, msg, vars, text, at FROM turns t
       WHERE t.bargain_id = o.bargain_id AND t.stall_id = o.stall_id
       ORDER BY t.at DESC, t.id DESC LIMIT 1
     ) l ON true
     WHERE o.bargain_id = ANY($1::uuid[])
     ORDER BY o.updated_at DESC`,
    [bargainIds],
  );
  const map = new Map<string, OfferView[]>();
  for (const r of rows) {
    const list = map.get(r.bargain_id) ?? [];
    const changed = r.last_at && r.last_at > r.updated_at ? r.last_at : r.updated_at;
    list.push({
      stall: { id: r.stall_id, name: r.stall_name, lang: r.stall_lang },
      item: r.item_name,
      status: r.current === null && r.status === "haggling" ? "waiting" : r.status,
      asked: r.asked,
      current: r.current,
      pending: r.current === null && r.status === "haggling",
      last: r.last_speaker
        ? { speaker: r.last_speaker, msg: r.last_msg, vars: r.last_vars, text: r.last_text }
        : null,
      minutesAgo: ago(changed),
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
    status: OfferStatus;
    at: Date;
  }>(
    `SELECT id::text, speaker, msg, vars, text, current, status, at
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
        status: t.status,
        at: t.at.toISOString(),
      })),
      next,
    },
  };
}

export type OpenStallMatch = {
  stallId: string;
  /** Stall A2A agent id; null until the shopkeeper has set UPI. */
  agentId: string | null;
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

// ---------------------------------------------------------------------------------------------
// Shopkeeper: today's deals on this stall.

/**
 * One buyer's order as the stall sees it: talking while agents move, offered once agreed
 * (buyer still to pay), won when paid, lost when the buyer paid another stall, no-deal when declined.
 */
export type DealState = "talking" | "waiting" | "offered" | "won" | "lost" | "no-deal";

export type DealView = {
  id: string;
  order: string;
  item: string;
  ask: number;
  final: number | null;
  current: number | null;
  state: DealState;
  /** When anything last happened (ms since 1970). */
  lastAt: number;
  /** The latest chat line, for the chat-list preview. */
  last: LastLine | null;
};

type DealRow = {
  bargain_id: string;
  want: string;
  buyer_lang: Lang;
  item: string;
  list_price: number;
  status: OfferStatus;
  asked: number | null;
  current: number | null;
  talking: boolean;
  lost: boolean;
  last_at: string | Date;
  last_speaker: LastLine["speaker"] | null;
  last_msg: string | null;
  last_vars: Record<string, string> | null;
  last_text: string | null;
};

const DEALS = `
  SELECT o.bargain_id, b.want, b.buyer_lang, i.name AS item, i.price AS list_price,
    o.status, o.asked, o.current,
    EXISTS (SELECT 1 FROM turns t
      WHERE t.bargain_id = o.bargain_id AND t.stall_id = o.stall_id
        AND t.at > now() - interval '3 seconds') AS talking,
    EXISTS (SELECT 1 FROM offers x
      WHERE x.bargain_id = o.bargain_id AND x.stall_id <> o.stall_id AND x.status = 'paid') AS lost,
    GREATEST(o.updated_at, COALESCE(l.at, o.updated_at)) AS last_at,
    l.speaker AS last_speaker, l.msg AS last_msg, l.vars AS last_vars, l.text AS last_text
  FROM offers o
  JOIN bargains b ON b.id = o.bargain_id
  JOIN stall_items i ON i.id = o.item_id
  LEFT JOIN LATERAL (
    SELECT t.speaker, t.msg, t.vars, t.text, t.at FROM turns t
    WHERE t.bargain_id = o.bargain_id AND t.stall_id = o.stall_id
    ORDER BY t.at DESC, t.id DESC LIMIT 1
  ) l ON true`;

const DEAL_STATE: Record<Exclude<OfferStatus, "waiting">, DealState> = {
  haggling: "waiting",
  agreed: "offered",
  paid: "won",
  declined: "no-deal",
};

function toDeal(r: DealRow): DealView {
  const stored = (r.status === "waiting" ? "haggling" : r.status) as Exclude<
    OfferStatus,
    "waiting"
  >;
  const state = r.talking ? "talking" : r.lost && stored !== "paid" ? "lost" : DEAL_STATE[stored];
  return {
    id: r.bargain_id,
    order: r.want,
    item: r.item,
    ask: r.asked ?? r.list_price,
    final: state === "offered" || state === "won" ? r.current : null,
    current: r.current,
    state,
    lastAt: new Date(r.last_at).getTime(),
    last: r.last_speaker
      ? { speaker: r.last_speaker, msg: r.last_msg, vars: r.last_vars, text: r.last_text }
      : null,
  };
}

/** Start of today on the India calendar, as a timestamp. */
const TODAY = `date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;

/**
 * Still worth the shopkeeper's attention: a conversation with anything said in the last hour, or a
 * deal (agreed or paid) made today. Everything else has ended: gone quiet, said no, or the buyer
 * took another stall.
 */
const ACTIVE = `((d.status IN ('agreed', 'paid') AND d.last_at >= ${TODAY})
  OR (d.status = 'haggling' AND NOT d.lost AND d.last_at > now() - interval '1 hour'))`;

/** This stall's bargains, as rows with `last_at`, `lost` and `status` to filter on. */
const STALL_DEALS = `(${DEALS} WHERE o.stall_id = $1 AND NOT o.stall_hidden) d`;

async function stallOf(user: Me) {
  const [stall] = await query<{ id: string; now: number }>(
    `SELECT id, extract(epoch FROM now())::float8 * 1000 AS now
     FROM stalls WHERE owner_id = $1`,
    [user.id],
  );
  return stall ?? null;
}

/** Counts for the shop screen's Bargains button: one small query, no rows. */
export async function shopDealsSummary(user: Me) {
  const stall = await stallOf(user);
  if (!stall) return { active: 0, sold: 0, ended: 0 };
  const [row] = await query<{ active: number; sold: number; ended: number }>(
    `SELECT count(*) FILTER (WHERE ${ACTIVE} AND d.status <> 'paid')::int AS active,
            count(*) FILTER (WHERE ${ACTIVE} AND d.status = 'paid')::int AS sold,
            count(*) FILTER (WHERE NOT ${ACTIVE})::int AS ended
     FROM ${STALL_DEALS}`,
    [stall.id],
  );
  return row ?? { active: 0, sold: 0, ended: 0 };
}

/** The Bargains screen: active bargains in full, and only how many have ended. */
export async function shopDealsActive(
  user: Me,
): Promise<{ deals: DealView[]; ended: number; now: number }> {
  const stall = await stallOf(user);
  if (!stall) return { deals: [], ended: 0, now: Date.now() };
  const [deals, [count]] = await Promise.all([
    query<DealRow>(`SELECT * FROM ${STALL_DEALS} WHERE ${ACTIVE} ORDER BY last_at DESC LIMIT 50`, [
      stall.id,
    ]),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM ${STALL_DEALS} WHERE NOT ${ACTIVE}`, [
      stall.id,
    ]),
  ]);
  return { deals: deals.map(toDeal), ended: count?.n ?? 0, now: stall.now };
}

/** Ended bargains, newest first. Fetched only when the shopkeeper opens that group. */
export async function shopDealsEnded(user: Me): Promise<DealView[]> {
  const stall = await stallOf(user);
  if (!stall) return [];
  const rows = await query<DealRow>(
    `SELECT * FROM ${STALL_DEALS} WHERE NOT ${ACTIVE} ORDER BY last_at DESC LIMIT 50`,
    [stall.id],
  );
  return rows.map(toDeal);
}

/** One order + chat for the stall's deal screen. */
export async function stallDeal(user: Me, bargainId: string) {
  if (!isBargainId(bargainId)) return null;
  const [stall] = await query<{ id: string }>(`SELECT id FROM stalls WHERE owner_id = $1`, [
    user.id,
  ]);
  if (!stall) return null;
  const [[row], chat] = await Promise.all([
    query<DealRow>(`${DEALS} WHERE o.stall_id = $1 AND o.bargain_id = $2::uuid`, [
      stall.id,
      bargainId,
    ]),
    shopChat(user, bargainId, stall.id),
  ]);
  if (!row || !chat) return null;
  return {
    deal: toDeal(row),
    stallId: stall.id,
    buyerLang: row.buyer_lang,
    turns: chat.turns,
    next: chat.next,
  };
}

/** Chat for a stall owner (not the buyer). */
async function shopChat(user: Me, bargainId: string, stallId: string): Promise<ChatView | null> {
  const [owned] = await query<{ ok: boolean }>(
    `SELECT true AS ok FROM stalls WHERE id = $1 AND owner_id = $2`,
    [stallId, user.id],
  );
  if (!owned) return null;
  const cached = await readChat<ChatView>(bargainId, stallId);
  if (cached) return cached.chat;
  const fresh = await loadChat(bargainId, stallId);
  if (!fresh) return null;
  await fillChat(bargainId, stallId, fresh);
  return fresh.chat;
}

/** Hide ended bargains from the shop list (buyer still has them). */
export async function hideStallDeals(user: Me, bargainIds: string[]) {
  if (!bargainIds.length) return;
  const [stall] = await query<{ id: string }>(`SELECT id FROM stalls WHERE owner_id = $1`, [
    user.id,
  ]);
  if (!stall) return;
  await query(
    `UPDATE offers SET stall_hidden = true, updated_at = now()
     WHERE stall_id = $1 AND bargain_id = ANY($2::uuid[])`,
    [stall.id, bargainIds],
  );
}
