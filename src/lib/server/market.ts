import "server-only";
import { query } from "@/lib/server/db";
import { redis, redisConfigured } from "@/lib/server/redis";
import { areaPriceFrom, itemKey, type AreaPrice } from "@/lib/market";
import type { MenuRow } from "@/lib/want";

export type { AreaPrice };

/** Close by first; a wider ring only when too few stalls close by sell it (meters). */
const RADII_M = [1000, 3000] as const;
/** Most stalls read per ring. */
const STALL_CAP = 200;
/** Deals older than this say little about today's prices. */
const DEAL_DAYS = 30;
const TTL_S = 60 * 60;
/** "Nothing known here" is cached too, but shorter: a new stall may open. */
const NONE_TTL_S = 10 * 60;

/** Distance from ($1, $2) to stall s, in meters, and the bounding-box filter ($3, $4 in degrees). */
const METERS = `(6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(($1::float8 - s.lat) / 2)), 2) +
    cos(radians($1::float8)) * cos(radians(s.lat)) *
    power(sin(radians(($2::float8 - s.lng) / 2)), 2)
  ))))`;
const BOX = `s.lat IS NOT NULL AND s.lng IS NOT NULL
  AND s.lat BETWEEN $1::float8 - $3::float8 AND $1::float8 + $3::float8
  AND s.lng BETWEEN $2::float8 - $4::float8 AND $2::float8 + $4::float8`;
const ROW = `i.id, i.stall_id AS "stallId", s.name AS "stallName", i.name, i.words`;

function box(lat: number, lng: number, radius: number) {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.max(0.2, Math.abs(Math.cos((lat * Math.PI) / 180))));
  return [lat, lng, dLat, dLng, radius];
}

/** Asking prices of every named stall within `radius`, open or not: a price is a price. */
function menusNear(lat: number, lng: number, radius: number) {
  return query<MenuRow>(
    `WITH near AS (
       SELECT s.id FROM stalls s
       WHERE s.name <> '' AND ${BOX} AND ${METERS} <= $5::float8
       ORDER BY ${METERS}, s.id LIMIT $6
     )
     SELECT ${ROW}, i.price FROM near n
     JOIN stalls s ON s.id = n.id
     JOIN stall_items i ON i.stall_id = n.id AND i.active`,
    [...box(lat, lng, radius), STALL_CAP],
  );
}

/**
 * What app buyers paid at stalls within `radius` lately, one row per deal. Only app bargains: their
 * `current` is one item's price, while an A2A deal's is a whole basket's total.
 */
function dealsNear(lat: number, lng: number, radius: number) {
  return query<MenuRow>(
    `SELECT ${ROW}, o.current AS price
     FROM offers o
     JOIN bargains b ON b.id = o.bargain_id AND b.source = 'app'
     JOIN stall_items i ON i.id = o.item_id
     JOIN stalls s ON s.id = o.stall_id
     WHERE o.status IN ('agreed', 'paid') AND o.current IS NOT NULL
       AND o.updated_at > now() - make_interval(days => $6)
       AND ${BOX} AND ${METERS} <= $5::float8
     ORDER BY o.updated_at DESC LIMIT 500`,
    [...box(lat, lng, radius), DEAL_DAYS],
  );
}

async function lookUp(item: string, lat: number, lng: number): Promise<AreaPrice | null> {
  for (const radius of RADII_M) {
    const [menus, deals] = await Promise.all([
      menusNear(lat, lng, radius),
      dealsNear(lat, lng, radius),
    ]);
    const found = areaPriceFrom(item, menus, deals, radius);
    if (found) return found;
  }
  return null;
}

/**
 * The usual price of `item` around (lat, lng): from deals made nearby when there are enough, else
 * from nearby menus; null when too few stalls nearby sell it. Looked up on a ~1 km grid (2 decimal
 * places), so one area shares one answer, cached for an hour.
 */
export async function areaPrice(item: string, lat: number, lng: number): Promise<AreaPrice | null> {
  const key = itemKey(item);
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const [gLat, gLng] = [Number(lat.toFixed(2)), Number(lng.toFixed(2))];
  const cacheKey = `market:v1:${key}:${gLat}:${gLng}`;

  if (redisConfigured()) {
    try {
      const hit = await (await redis()).get(cacheKey);
      if (hit !== null) return JSON.parse(hit) as AreaPrice | null;
    } catch (e) {
      console.warn("market cache", (e as Error).message);
    }
  }
  const found = await lookUp(item, gLat, gLng);
  if (redisConfigured()) {
    try {
      await (
        await redis()
      ).set(cacheKey, JSON.stringify(found), {
        EX: found ? TTL_S : NONE_TTL_S,
      });
    } catch (e) {
      console.warn("market cache", (e as Error).message);
    }
  }
  return found;
}
