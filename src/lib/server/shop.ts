import "server-only";
import { redirect } from "next/navigation";
import type { Lang } from "@/lib/languages";
import { currentSession } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { geminiConfigured } from "@/lib/server/gemini";

export type Me = { id: string; email: string };
export type Style = "friendly" | "firm";

export type StallStatus = "open" | "closed" | "paused";

export type ShopStall = {
  id: string;
  name: string;
  upi: string;
  qr: string | null;
  style: Style;
  lang: Lang;
  /** Buyer-facing: true only when status is open. */
  open: boolean;
  /** Sign + shop status: open, closed, or paused. */
  status: StallStatus;
  /** Seconds left when status is paused. */
  pauseSecondsLeft: number;
  lat: number | null;
  lng: number | null;
  agentId: string | null;
};

/** One menu row: asking price (`price`) and absolute floor (`lowest`). */
export type ShopItem = {
  id: number;
  name: string;
  price: number;
  lowest: number;
  aliases: string[];
};

/** The signed-in user. Call it inside <Suspense> (it reads the request). */
export async function me(): Promise<Me> {
  const session = await currentSession();
  if (!session) redirect("/sign-in");
  return { id: session.user, email: session.email };
}

export async function ensureUser(user: Me) {
  await query(
    `INSERT INTO users (id, email) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [user.id, user.email],
  );
}

/** An open (or nearby-listed) stall for the buyer home. */
export type NearbyStall = {
  id: string;
  name: string;
  lang: Lang;
  open: boolean;
  agentId: string | null;
};

/**
 * Stalls buyers can see: open ones first, then recently updated closed shells with a name.
 * Full geo ranking comes later; for now it's the market directory.
 */
export async function stallsNear(): Promise<NearbyStall[]> {
  const rows = await query<{
    id: string;
    name: string;
    lang: Lang;
    is_open: boolean;
    agent_id: string | null;
  }>(
    `SELECT id, name, lang, is_open, agent_id FROM stalls
     WHERE name <> '' AND upi_id IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
       AND EXISTS (SELECT 1 FROM stall_items i WHERE i.stall_id = stalls.id AND i.active)
     ORDER BY is_open DESC, updated_at DESC
     LIMIT 40`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lang: r.lang,
    open: r.is_open,
    agentId: r.agent_id,
  }));
}

/** Stall shell + active menu for the shop screen. */
export async function myShop(user: Me): Promise<{
  stall: ShopStall | null;
  items: ShopItem[];
  canReadMenu: boolean;
}> {
  const [stall] = await query<{
    id: string;
    name: string;
    upi_id: string | null;
    upi_qr: string | null;
    style: Style;
    lang: Lang;
    is_open: boolean;
    device_status: StallStatus;
    pause_until: Date | null;
    lat: number | null;
    lng: number | null;
    agent_id: string | null;
    items: { id: number; name: string; price: number; lowest: number; aliases: string }[] | null;
  }>(
    `SELECT s.id, s.name, s.upi_id, s.upi_qr, s.style, s.lang, s.is_open, s.device_status, s.pause_until,
       s.lat, s.lng, s.agent_id,
       (SELECT json_agg(json_build_object(
          'id', i.id, 'name', i.name, 'price', i.price, 'lowest', i.lowest, 'aliases', i.words
        ) ORDER BY i.id)
        FROM stall_items i WHERE i.stall_id = s.id AND i.active) AS items
     FROM stalls s WHERE s.owner_id = $1`,
    [user.id],
  );
  if (!stall) return { stall: null, items: [], canReadMenu: geminiConfigured() };

  let status: StallStatus = stall.device_status;
  let pauseSecondsLeft = 0;
  if (status === "paused" && stall.pause_until) {
    pauseSecondsLeft = Math.max(0, Math.ceil((stall.pause_until.getTime() - Date.now()) / 1000));
    if (pauseSecondsLeft === 0) {
      status = "open";
      pauseSecondsLeft = 0;
    }
  }
  // Buyer flag wins if somehow out of sync; prefer device_status when present.
  if (status === "open" && !stall.is_open) status = "closed";

  return {
    stall: {
      id: stall.id,
      name: stall.name,
      upi: stall.upi_id ?? "",
      qr: stall.upi_qr,
      style: stall.style,
      lang: stall.lang,
      open: status === "open",
      status,
      pauseSecondsLeft,
      lat: stall.lat,
      lng: stall.lng,
      agentId: stall.agent_id,
    },
    items: (stall.items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      lowest: i.lowest,
      aliases: String(i.aliases ?? "")
        .split(" ")
        .filter(Boolean),
    })),
    canReadMenu: geminiConfigured(),
  };
}
