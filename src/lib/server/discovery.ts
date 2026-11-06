import "server-only";
import { isDiscoveryMode, type DiscoveryMode } from "@/lib/discovery-mode";
import { query } from "@/lib/server/db";
import { redis, redisConfigured } from "@/lib/server/redis";

/*
 * Buyer discovery preference:
 *   read   Redis → on a miss, Postgres → copy into Redis with a TTL
 *   write  Postgres first → then set Redis (a brief Redis outage doesn't lose the save)
 * A Redis outage never blocks: every call .catch's and falls back to Postgres.
 *   user-discovery:{userId}   "location" | "nearby"   TTL from DISCOVERY_CACHE_TTL (seconds)
 */

const DEFAULT_TTL = 300;
const DEFAULT_MODE: DiscoveryMode = "nearby";
const discoveryKey = (userId: string) => `user-discovery:${userId}`;

/** Adjustable Redis TTL in seconds (env DISCOVERY_CACHE_TTL, default 300). */
export function discoveryCacheTtl(): number {
  const n = Number(process.env.DISCOVERY_CACHE_TTL ?? DEFAULT_TTL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TTL;
}

async function cacheGet(userId: string): Promise<DiscoveryMode | null> {
  if (!redisConfigured()) return null;
  try {
    const raw = await (await redis()).get(discoveryKey(userId));
    return isDiscoveryMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function cacheSet(userId: string, mode: DiscoveryMode) {
  if (!redisConfigured()) return;
  try {
    await (await redis()).set(discoveryKey(userId), mode, { EX: discoveryCacheTtl() });
  } catch {
    /* Redis outage: Postgres still has the value */
  }
}

export async function getDiscovery(userId: string): Promise<DiscoveryMode> {
  const cached = await cacheGet(userId);
  if (cached) return cached;

  const [row] = await query<{ discovery: string }>("SELECT discovery FROM users WHERE id = $1", [
    userId,
  ]);
  const mode = isDiscoveryMode(row?.discovery) ? row.discovery : DEFAULT_MODE;
  await cacheSet(userId, mode);
  return mode;
}

/** Persist to Postgres, then refresh the Redis cache. Call after the user row exists. */
export async function saveDiscovery(userId: string, mode: DiscoveryMode) {
  await query("UPDATE users SET discovery = $2 WHERE id = $1", [userId, mode]);
  await cacheSet(userId, mode);
}
