"use server";

import { refresh } from "next/cache";
import { isDiscoveryMode, type DiscoveryMode } from "@/lib/discovery-mode";
import { getDiscovery, saveDiscovery } from "@/lib/server/discovery";
import { ensureUser, me } from "@/lib/server/shop";

/** Persist discovery preference: Postgres for keeps, Redis for a short TTL cache. */
export async function saveDiscoveryMode(
  mode: DiscoveryMode,
): Promise<{ error: string } | { mode: DiscoveryMode }> {
  if (!isDiscoveryMode(mode)) return { error: "Pick location or nearby agents." };
  const user = await me();
  await ensureUser(user);
  await saveDiscovery(user.id, mode);
  refresh();
  return { mode };
}

/** Current preference (Redis first, then DB). */
export async function myDiscoveryMode(): Promise<DiscoveryMode> {
  const user = await me();
  await ensureUser(user);
  return getDiscovery(user.id);
}
