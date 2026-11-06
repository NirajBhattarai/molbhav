/*
 * "The usual price around here": what nearby stalls ask for an item, or better, what buyers nearby
 * actually paid. Pure maths here (shared, testable); the queries are in server/market.ts.
 * A buyer's agent plans its opening and its limit from this; it never moves a stall's floor.
 */
import { menuMatch, words, type MenuRow } from "@/lib/want";

/** The middle of the area's prices, and the band most of them fall in, in whole rupees. */
export type AreaPrice = {
  item: string;
  medianInr: number;
  /** 25th percentile: a good price here. */
  lowInr: number;
  /** 75th percentile: about the most anyone pays here. */
  highInr: number;
  /** How many prices it's built from: stalls for "menus", deals for "deals". */
  samples: number;
  /** "deals": what buyers paid in the last weeks; "menus": stalls' asking prices. */
  source: "deals" | "menus";
  radiusM: number;
};

/** Fewer prices than this and there's no "usual" to speak of. */
export const MIN_MENUS = 3;
/** Paid prices beat asking prices, once there are enough of them. */
export const MIN_DEALS = 5;

/** The q-th quantile (0..1) of sorted numbers, interpolating between neighbours. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** Median and quartiles of some prices, rounded to whole rupees. */
export function spread(prices: number[]) {
  const sorted = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const r = (q: number) => Math.round(quantile(sorted, q));
  return { medianInr: r(0.5), lowInr: r(0.25), highInr: r(0.75), samples: sorted.length };
}

/** The item as a cache key: its menu words, sorted, so "Masala chai" and "chai masala" share one. */
export const itemKey = (item: string) => [...words(item)].sort().join(" ");

/**
 * Prices for `item` from nearby menus (one per stall, its best whole-name match, so "chai" doesn't
 * pick up "tea powder") and nearby deals (each its own row, `price` = what was paid).
 */
export function areaPriceFrom(
  item: string,
  menus: MenuRow[],
  deals: MenuRow[],
  radiusM: number,
): AreaPrice | null {
  const full = (rows: MenuRow[]) => {
    const m = menuMatch(rows, item);
    return m?.fit === "full" ? m.row.price : null;
  };
  const paid = deals.map((d) => full([d])).filter((p): p is number => p !== null);
  if (paid.length >= MIN_DEALS) {
    const s = spread(paid);
    if (s) return { item, ...s, source: "deals", radiusM };
  }
  const byStall = new Map<string, MenuRow[]>();
  for (const row of menus) byStall.set(row.stallId, [...(byStall.get(row.stallId) ?? []), row]);
  const asked = [...byStall.values()].map(full).filter((p): p is number => p !== null);
  if (asked.length < MIN_MENUS) return null;
  const s = spread(asked);
  return s && { item, ...s, source: "menus", radiusM };
}

/** A basket's usual price: its lines' area prices × quantities, added up. */
export type BasketBand = Pick<AreaPrice, "medianInr" | "lowInr" | "highInr" | "source"> & {
  /** The fewest prices any line's band rests on. */
  samples: number;
};

/** Adds up each line's area price × qty; null when any line has none (half a basket misleads). */
export function basketBand(lines: { qty: number; price: AreaPrice | null }[]): BasketBand | null {
  if (!lines.length || lines.some((l) => !l.price)) return null;
  const sum = (k: "medianInr" | "lowInr" | "highInr") =>
    lines.reduce((t, l) => t + l.price![k] * l.qty, 0);
  return {
    medianInr: sum("medianInr"),
    lowInr: sum("lowInr"),
    highInr: sum("highInr"),
    samples: Math.min(...lines.map((l) => l.price!.samples)),
    source: lines.every((l) => l.price!.source === "deals") ? "deals" : "menus",
  };
}

/** Where a price sits against the usual band, in words a prompt can use as is. */
export function against(price: number, band: Pick<BasketBand, "lowInr" | "highInr">) {
  return price < band.lowInr
    ? "below what stalls around here usually get"
    : price > band.highInr
      ? "above what stalls around here usually get"
      : "within the usual range around here";
}
