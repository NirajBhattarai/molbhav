import "server-only";
import { redis, redisConfigured } from "@/lib/server/redis";

/*
 * Stall chat cache (cache-aside, Postgres stays the record):
 *   read   Redis → on a miss, Postgres → copy into Redis for CHAT_CACHE_TTL (default 1 hour)
 *   write  Postgres first → then mark the chat's new version in Redis and drop the old copy;
 *          after a whole step (a haggle, an Agree, Paid) the fresh chat is copied back in.
 *
 *   chat:{bargainId}:{stallId}     "<version>|<json>"   the chat as the buyer sees it
 *   chat-v:{bargainId}:{stallId}   "<version>"          newest version written to Postgres
 *
 * Every write bumps offers.version. A copy older than chat-v is never served or stored, so a slow
 * read can't put back a chat from before a newer line. A Redis outage never blocks: every call
 * falls back to Postgres.
 */

const DEFAULT_TTL = 3600;

export function chatCacheTtl(): number {
  const n = Number(process.env.CHAT_CACHE_TTL ?? DEFAULT_TTL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TTL;
}

const dataKey = (b: string, s: string) => `chat:${b}:${s}`;
const versionKey = (b: string, s: string) => `chat-v:${b}:${s}`;

// Serve the copy only if nothing newer has been written since it was made.
const READ = `
local data = redis.call('GET', KEYS[1])
if not data then return false end
local v = tonumber(string.match(data, '^(%d+)|'))
local newest = tonumber(redis.call('GET', KEYS[2]) or '0')
if not v or v < newest then return false end
return data`;

// Store a copy unless a newer version was written, or a newer copy is already there.
const FILL = `
local v = tonumber(ARGV[1])
local newest = tonumber(redis.call('GET', KEYS[2]) or '0')
if v < newest then return 0 end
local data = redis.call('GET', KEYS[1])
if data then
  local have = tonumber(string.match(data, '^(%d+)|'))
  if have and have > v then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1] .. '|' .. ARGV[2], 'EX', ARGV[3])
return 1`;

// Record a write: raise the newest version and drop the copy that's now out of date.
const WROTE = `
local v = tonumber(ARGV[1])
local newest = tonumber(redis.call('GET', KEYS[2]) or '0')
if v > newest then redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2]) end
redis.call('DEL', KEYS[1])
return 1`;

export type CachedChat<T> = { buyerId: string; version: number; chat: T };

/** The cached chat, or null on a miss, a stale copy, or Redis being down. */
export async function readChat<T>(
  bargainId: string,
  stallId: string,
): Promise<CachedChat<T> | null> {
  if (!redisConfigured()) return null;
  try {
    const client = await redis();
    const raw = await client.eval(READ, {
      keys: [dataKey(bargainId, stallId), versionKey(bargainId, stallId)],
    });
    if (typeof raw !== "string") return null;
    return JSON.parse(raw.slice(raw.indexOf("|") + 1)) as CachedChat<T>;
  } catch {
    return null;
  }
}

/** Copies a chat just read from Postgres into Redis. */
export async function fillChat<T>(bargainId: string, stallId: string, value: CachedChat<T>) {
  if (!redisConfigured()) return;
  try {
    const client = await redis();
    await client.eval(FILL, {
      keys: [dataKey(bargainId, stallId), versionKey(bargainId, stallId)],
      arguments: [String(value.version), JSON.stringify(value), String(chatCacheTtl())],
    });
  } catch {
    /* Redis outage: Postgres still has the chat */
  }
}

/** Call after every Postgres write to a chat, with the offer's new version. */
export async function wroteChat(bargainId: string, stallId: string, version: number) {
  if (!redisConfigured()) return;
  try {
    const client = await redis();
    await client.eval(WROTE, {
      keys: [dataKey(bargainId, stallId), versionKey(bargainId, stallId)],
      arguments: [String(version), String(chatCacheTtl())],
    });
  } catch {
    /* Redis outage: the old copy expires within the TTL */
  }
}
