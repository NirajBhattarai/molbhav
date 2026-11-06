import "server-only";
import { createClient, type RedisClientType } from "redis";

// Redis from Vercel's Storage tab (Redis Cloud): one TCP connection per server instance, reused.
// Also: buyer-limits:{userId} (spending limits, 10 min) — see server/limits.ts.

let connecting: Promise<RedisClientType> | undefined;

export const redisConfigured = () => Boolean(process.env.REDIS_URL?.trim());

/** The shared, connected client. Throws when REDIS_URL isn't set. */
export function redis(): Promise<RedisClientType> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error("REDIS_URL is not set (see .env.example).");
  if (connecting) return connecting;
  const client: RedisClientType = createClient({ url });
  // Without a listener, a dropped connection crashes the process; the client reconnects itself.
  client.on("error", (e: Error) => console.warn("redis", e.message));
  const pending = client.connect().catch((e: unknown) => {
    connecting = undefined; // let the next call try again
    throw e;
  });
  connecting = pending;
  return pending;
}
