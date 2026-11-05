import "server-only";
import { redirect } from "next/navigation";
import type { Lang } from "@/lib/languages";
import { currentSession } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { geminiConfigured } from "@/lib/server/gemini";

export type Me = { id: string; email: string };
export type Style = "friendly" | "firm";

export type ShopStall = {
  id: string;
  name: string;
  upi: string;
  qr: string | null;
  style: Style;
  lang: Lang;
  open: boolean;
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
    "INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email",
    [user.id, user.email],
  );
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
    lat: number | null;
    lng: number | null;
    agent_id: string | null;
    items: { id: number; name: string; price: number; lowest: number; aliases: string }[] | null;
  }>(
    `SELECT s.id, s.name, s.upi_id, s.upi_qr, s.style, s.lang, s.is_open, s.lat, s.lng, s.agent_id,
       (SELECT json_agg(json_build_object(
          'id', i.id, 'name', i.name, 'price', i.price, 'lowest', i.lowest, 'aliases', i.words
        ) ORDER BY i.id)
        FROM stall_items i WHERE i.stall_id = s.id AND i.active) AS items
     FROM stalls s WHERE s.owner_id = $1`,
    [user.id],
  );
  if (!stall) return { stall: null, items: [], canReadMenu: geminiConfigured() };
  return {
    stall: {
      id: stall.id,
      name: stall.name,
      upi: stall.upi_id ?? "",
      qr: stall.upi_qr,
      style: stall.style,
      lang: stall.lang,
      open: stall.is_open,
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
