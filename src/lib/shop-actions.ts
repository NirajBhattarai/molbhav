"use server";

import { refresh } from "next/cache";
import { isLang, type Lang } from "@/lib/languages";
import { ensureUser, me, type Style } from "@/lib/server/shop";
import { query } from "@/lib/server/db";
import { parseUpi } from "@/lib/upi";

const newStallId = () => `u-${crypto.randomUUID().slice(0, 8)}`;

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);

/** The stall sheet: name, UPI ID (and the QR it came from), how its agent bargains, its language. */
export async function saveStallDetails(details: {
  name: string;
  upi: string;
  qr: string | null;
  style: Style;
  language: Lang;
}): Promise<{ error: string } | null> {
  const user = await me();
  const name = clean(details.name, 60);
  const typed = clean(details.upi, 80).replace(/ /g, "");
  let upi: string | null = null;
  let qr: string | null = null;
  if (typed) {
    const payee = parseUpi(typed);
    if ("error" in payee) return { error: "A UPI ID looks like name@bank, e.g. ramu@okaxis." };
    upi = payee.vpa;
    const scanned = details.qr ? parseUpi(details.qr) : null;
    qr = scanned && "vpa" in scanned && scanned.vpa === upi ? (scanned.qr ?? null) : null;
  }
  const style: Style = details.style === "firm" ? "firm" : "friendly";
  const lang = isLang(details.language) ? details.language : "en";

  await ensureUser(user);
  try {
    await query(
      `INSERT INTO stalls (id, owner_id, name, upi_id, upi_qr, style, lang, is_open, agent_id, updated_at)
       VALUES ($2, $1, $3, $4, $5, $6, $7, false,
         CASE WHEN $4::text IS NULL THEN NULL
           ELSE 'agent_' || left(encode(sha256(convert_to($4::text, 'UTF8')), 'hex'), 10) END,
         now())
       ON CONFLICT (owner_id) DO UPDATE SET
         name = EXCLUDED.name,
         upi_id = EXCLUDED.upi_id,
         upi_qr = EXCLUDED.upi_qr,
         style = EXCLUDED.style,
         lang = EXCLUDED.lang,
         agent_id = EXCLUDED.agent_id,
         updated_at = now(),
         is_open = stalls.is_open AND EXCLUDED.name <> '' AND EXCLUDED.upi_id IS NOT NULL
           AND stalls.lat IS NOT NULL AND stalls.lng IS NOT NULL`,
      [user.id, newStallId(), name, upi, qr, style, lang],
    );
  } catch (e) {
    if ((e as { constraint?: string }).constraint === "stalls_agent_id_key")
      return { error: "Another stall already takes payments at this UPI ID." };
    throw e;
  }
  refresh();
  return null;
}

/** Where the stall is, from the phone's GPS. */
export async function pinLocation(lat: number, lng: number): Promise<{ error: string } | null> {
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || (lat === 0 && lng === 0))
    return { error: "Couldn’t share location." };
  const user = await me();
  await ensureUser(user);
  await query(
    `INSERT INTO stalls (id, owner_id, name, lang, is_open, lat, lng, updated_at)
     VALUES ($2, $1, '', 'en', false, $3, $4, now())
     ON CONFLICT (owner_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = now()`,
    [user.id, newStallId(), lat, lng],
  );
  refresh();
  return null;
}

/**
 * Open or closed. Opens only when the open gate passes: named, UPI set, and pinned.
 */
export async function setStallOpen(open: boolean) {
  const user = await me();
  await query(
    `UPDATE stalls s SET is_open = $2, updated_at = now() WHERE owner_id = $1
       AND (NOT $2 OR (s.name <> '' AND s.upi_id IS NOT NULL AND s.lat IS NOT NULL AND s.lng IS NOT NULL))`,
    [user.id, open === true],
  );
  refresh();
}
