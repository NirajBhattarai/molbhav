import "server-only";
import { NO_LIMITS, brokenLimit, type Limits } from "@/lib/limits";
import { query } from "@/lib/server/db";
import { redis, redisConfigured } from "@/lib/server/redis";

/*
 * Buyer spending limits (incl. auto-order): Postgres is the source of truth; Redis sits in front
 * for quick reads on create / auto-order / pay checks.
 *   read   Redis → on a miss, Postgres → copy into Redis with a TTL
 *   write  Postgres first → then set Redis (so a brief Redis outage doesn't lose the save)
 * A Redis outage never blocks: every call .catch's and falls back to Postgres.
 *   buyer-limits:{userId}   { perOrder, perDay, autoAgree, autoOrder }   10 min
 */
const LIMITS_TTL = 600;
const limitsKey = (userId: string) => `buyer-limits:${userId}`;

function asLimits(value: unknown): Limits | null {
  if (!value || typeof value !== "object") return null;
  const { perOrder, perDay, autoAgree, autoOrder } = value as Record<string, unknown>;
  const ok = (n: unknown) => n === null || (typeof n === "number" && Number.isInteger(n));
  if (!ok(perOrder) || !ok(perDay)) return null;
  if (typeof autoAgree !== "boolean" || typeof autoOrder !== "boolean") return null;
  return {
    perOrder: perOrder as number | null,
    perDay: perDay as number | null,
    autoAgree,
    autoOrder,
  };
}

async function cacheGet(userId: string): Promise<Limits | null> {
  if (!redisConfigured()) return null;
  const raw = await (await redis()).get(limitsKey(userId)).catch(() => null);
  if (!raw) return null;
  try {
    return asLimits(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function cacheSet(userId: string, limits: Limits) {
  if (!redisConfigured()) return;
  await (
    await redis()
  )
    .set(limitsKey(userId), JSON.stringify(limits), { EX: LIMITS_TTL })
    .catch(() => {});
}

export async function getLimits(userId: string): Promise<Limits> {
  const cached = await cacheGet(userId);
  if (cached) return cached;

  const [row] = await query<{
    per_order: number | null;
    per_day: number | null;
    auto_agree: boolean;
    auto_order: boolean;
  }>("SELECT per_order, per_day, auto_agree, auto_order FROM buyer_limits WHERE user_id = $1", [
    userId,
  ]);
  const limits: Limits = row
    ? {
        perOrder: row.per_order,
        perDay: row.per_day,
        autoAgree: row.auto_agree,
        autoOrder: row.auto_order,
      }
    : NO_LIMITS;
  await cacheSet(userId, limits);
  return limits;
}

export async function saveLimits(userId: string, limits: Limits) {
  const { perOrder, perDay, autoAgree, autoOrder } = limits;
  await query(
    `INSERT INTO buyer_limits (user_id, per_order, per_day, auto_agree, auto_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
     SET per_order = $2, per_day = $3, auto_agree = $4, auto_order = $5, updated_at = now()`,
    [userId, perOrder, perDay, autoAgree, autoOrder],
  );
  await cacheSet(userId, { perOrder, perDay, autoAgree, autoOrder });
}

/** What this buyer has marked paid since midnight in India. */
async function spentToday(userId: string) {
  const [row] = await query<{ spent: number }>(
    `SELECT COALESCE(SUM(o.current), 0)::int AS spent
     FROM offers o JOIN bargains b ON b.id = o.bargain_id
     WHERE b.buyer_id = $1 AND o.status = 'paid'
       AND o.updated_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`,
    [userId],
  );
  return row?.spent ?? 0;
}

/** The limit this payment would break, if any. */
export async function payingBreaks(userId: string, amount: number) {
  const [limits, spent] = await Promise.all([getLimits(userId), spentToday(userId)]);
  return brokenLimit(amount, spent, limits);
}
