/**
 * Reading a buyer's order: extract words/prices for menu match. No I/O.
 * Money is whole rupees.
 */

const STOP = new Set(
  "a an the and or for of to in on with under below upto up max within budget less than not over rs inr rupees price please some want need looking buy me my i do two three four five six need".split(
    " ",
  ),
);

const QTY_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  paanch: 5,
};

function stem(w: string) {
  return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

export function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  );
}

/** A price in the text: "₹2,000", "2000 rs", "under 1500", "2k". Null when there's none. */
export function priceIn(text: string): number | null {
  const t = text.toLowerCase().replace(/(\d),(?=\d)/g, "$1");
  const k = /(\d+(?:\.\d+)?)\s*k\b/.exec(t);
  if (k) return Math.round(Number(k[1]) * 1000);
  const m =
    /(?:₹|rs\.?|inr)\s*(\d+)/.exec(t) ??
    /(\d+)\s*(?:₹|rs\b|rupees|inr)/.exec(t) ??
    /(?:under|below|upto|up to|max|within|budget|less than|not over|over)\D{0,3}(\d+)/.exec(t) ??
    /\b(\d{3,})\b(?!\s*(?:l|ml|kg|g|cm|m|pcs?|pieces?)\b)/.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return n >= 10 ? n : null;
}

export type WantLine = { name: string; qty: number };

/**
 * Strip speech fluff so "I need 2 samosa and 2 chai" parses like "2 samosa ; 2 chai".
 */
function cleanOrder(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[₹,]/g, " ")
      .replace(/^(?:um+|uh+|so+|okay|ok|please|ji|haan|yes)\s+/i, "")
      .replace(
        /^(?:i\s+)?(?:just\s+)?(?:would\s+like|wanna|want|need|like|get|have|order|looking\s+for|give\s+me|can\s+i\s+get|i'?ll\s+take)\s+/i,
        "",
      )
      .replace(/\b(?:please|thanks|thank you|ji)\b/g, " ")
      // `&` / `,` / `+` are not word chars — `\b` alone won't split "tomatoes & onions".
      // Speech often says "or" for a list ("do chai or samosa") — treat like "and".
      .replace(/\s*(?:&|,|\+|plus)\s*|\b(?:and|or|with)\b/gi, " ; ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Fast local parse for clear English orders like "2 chai and 2 samosa", "do chai or samosa".
 * Returns [] when nothing solid is found (caller may use Gemini).
 */
export function parseWantLocal(text: string): WantLine[] {
  const t = cleanOrder(text);
  if (!t) return [];

  const found: WantLine[] = [];
  const parts = t.split(/\s*;\s*/);
  const qtyWord =
    "\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|char|paanch";

  for (const part of parts) {
    const chunk = part.trim();
    if (!chunk) continue;

    // "2 samosa", "two chai", "samosa x 2", "pani puri for 4"
    const m =
      new RegExp(`^(${qtyWord})\\s+([a-z][a-z ]{0,40}?)$`, "i").exec(chunk) ??
      /^([a-z][a-z ]{1,40}?)\s+(?:x|×|\*)\s*(\d+)$/i.exec(chunk) ??
      /^([a-z][a-z ]{1,40}?)\s+for\s+(\d+)$/i.exec(chunk) ??
      // Trailing qty: "samosa 2"
      new RegExp(`^([a-z][a-z ]{1,40}?)\\s+(${qtyWord})$`, "i").exec(chunk);

    if (m) {
      let qty: number;
      let name: string;
      const leftIsQty = /^\d+$/.test(m[1]) || QTY_WORDS[m[1].toLowerCase()] !== undefined;
      if (leftIsQty) {
        qty = /^\d+$/.test(m[1]) ? Number(m[1]) : QTY_WORDS[m[1].toLowerCase()];
        name = m[2];
      } else {
        name = m[1];
        qty = /^\d+$/.test(m[2]) ? Number(m[2]) : (QTY_WORDS[m[2].toLowerCase()] ?? 1);
      }
      name = name
        .replace(/\b(please|under|below|rs|rupees|inr)\b.*$/i, "")
        .trim()
        .replace(/\s+/g, " ");
      // Don't treat qty words as item names
      if (!name || name.length < 2 || QTY_WORDS[name] || !(qty > 0 && qty <= 99)) continue;
      found.push({ name: stem(name.split(" ").map(stem).join(" ")), qty });
      continue;
    }

    // Bare item in a list: "do chai ; samosa" → samosa qty 1
    const bare = chunk.replace(/^\d+\s*/, "").trim();
    if (/^[a-z][a-z ]{1,40}$/.test(bare) && words(bare).size > 0 && !QTY_WORDS[bare]) {
      found.push({ name: stem(bare.split(" ").map(stem).join(" ")), qty: 1 });
    }
  }

  return found.slice(0, 8);
}

export function labelWant(line: WantLine) {
  return line.qty > 1 ? `${line.qty}× ${title(line.name)}` : title(line.name);
}

function title(s: string) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export type MenuRow = {
  id: number;
  stallId: string;
  stallName: string;
  name: string;
  words: string;
  price: number;
};

/**
 * How well a menu row fits a want line: "full" when it has every word of the line, "head" when it
 * has the line's last word, the thing itself ("masala chai" → chai, "chicken biryani" → biryani).
 * A row sharing only a describing word ("masala" in Masala Dosa) doesn't fit at all.
 */
export type MenuFit = "full" | "head";

/** The best-fitting menu row for a want line, and how well it fits; null when none fits. */
export function menuMatch(items: MenuRow[], want: string): { row: MenuRow; fit: MenuFit } | null {
  const need = [...words(want)];
  if (!need.length) return null;
  const head = need[need.length - 1];
  let best: { row: MenuRow; fit: MenuFit } | null = null;
  let bestScore = 0;
  for (const item of items) {
    const has = words(`${item.name} ${item.words}`);
    const hits = need.filter((w) => has.has(w)).length;
    const fit: MenuFit | null = hits === need.length ? "full" : has.has(head) ? "head" : null;
    if (!fit) continue;
    // Full fits first; then more of the line's words; the first row wins a tie.
    const score = (fit === "full" ? 100 : 0) + hits;
    if (score > bestScore) [best, bestScore] = [{ row: item, fit }, score];
  }
  return best;
}

/** Best menu row for a want line, or null. */
export function matchMenu(items: MenuRow[], want: string): MenuRow | null {
  return menuMatch(items, want)?.row ?? null;
}

/**
 * The stalls to bargain with for these lines, one item each: whole-name matches before
 * last-word ones ("chai" for "masala chai"), then in pool order (as heard, or nearest).
 */
export function rankStalls(lines: WantLine[], pool: MenuRow[], max = 5): HeardWant["stalls"] {
  const byStall = new Map<string, MenuRow[]>();
  for (const row of pool) byStall.set(row.stallId, [...(byStall.get(row.stallId) ?? []), row]);
  const hits: { stall: HeardWant["stalls"][number]; full: boolean; at: number }[] = [];
  for (const rows of byStall.values()) {
    let best: ReturnType<typeof menuMatch> = null;
    for (const line of lines) {
      const m = menuMatch(rows, line.name);
      if (m && (!best || (m.fit === "full" && best.fit !== "full"))) best = m;
      if (best?.fit === "full") break;
    }
    if (!best) continue;
    const { row } = best;
    hits.push({
      stall: { id: row.stallId, name: row.stallName, item: row.name },
      full: best.fit === "full",
      at: hits.length,
    });
  }
  return hits
    .sort((a, b) => Number(b.full) - Number(a.full) || a.at - b.at)
    .slice(0, max)
    .map((h) => h.stall);
}

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** What the buyer's agent understood of an order (shared client/server). */
export type HeardWant = {
  /** Display chips, e.g. "2× Chai". */
  items: string[];
  /** The order as menu lines, so the server can pick stalls again without asking Gemini. */
  lines: WantLine[];
  budget: number | null;
  english: string;
  /** Open stalls that sell at least one asked item. */
  stalls: { id: string; name: string; item: string }[];
};

const str = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * What the order sheet already understood, sent back with "Start bargaining" so the server
 * doesn't ask Gemini a second time. Untrusted: only the shape is checked here, and stalls and
 * prices are read again from the database. Anything off returns null, and the server re-reads
 * the order itself.
 */
export function parseHeard(raw: unknown): HeardWant | null {
  if (typeof raw !== "string" || raw.length > 8000) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const h = v as Record<string, unknown>;
  const budget = h.budget;
  if (
    !Array.isArray(h.items) ||
    h.items.length > 20 ||
    !h.items.every((i) => str(i, 80)) ||
    !(
      budget === null ||
      (Number.isInteger(budget) && (budget as number) > 0 && (budget as number) <= 1_000_000)
    ) ||
    !(h.english === "" || str(h.english, 400)) ||
    !Array.isArray(h.lines) ||
    h.lines.length < 1 ||
    h.lines.length > 8 ||
    !h.lines.every(
      (l) =>
        !!l &&
        str((l as WantLine).name, 40) &&
        Number.isInteger((l as WantLine).qty) &&
        (l as WantLine).qty > 0 &&
        (l as WantLine).qty <= 99,
    ) ||
    !Array.isArray(h.stalls) ||
    h.stalls.length > 8
  )
    return null;
  const stalls: HeardWant["stalls"] = [];
  for (const s of h.stalls as unknown[]) {
    const r = (s ?? {}) as Record<string, unknown>;
    if (!str(r.id, 64) || !str(r.name, 80) || !str(r.item, 80)) return null;
    stalls.push({ id: r.id, name: r.name, item: r.item });
  }
  return {
    items: h.items as string[],
    lines: (h.lines as WantLine[]).map((l) => ({ name: l.name, qty: l.qty })),
    budget: budget as number | null,
    english: h.english as string,
    stalls,
  };
}
