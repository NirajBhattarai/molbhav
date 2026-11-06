import "server-only";
import { redis, redisConfigured } from "@/lib/server/redis";

/**
 * Fixed-window limit: true while `key` has been used at most `limit` times in `windowSec`.
 * Without Redis (or when it's down) it allows the call, so a cache outage never locks people out.
 */
export async function withinLimit(key: string, limit: number, windowSec: number) {
  if (!redisConfigured()) return true;
  try {
    const client = await redis();
    const count = await client.incr(`rate:${key}`);
    if (count === 1) await client.expire(`rate:${key}`, windowSec);
    return count <= limit;
  } catch {
    return true;
  }
}
