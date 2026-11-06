/** How the buyer’s agent finds stalls: GPS market search, or nearby BLE agents. */
export type DiscoveryMode = "location" | "nearby";

export const isDiscoveryMode = (v: unknown): v is DiscoveryMode =>
  v === "location" || v === "nearby";
