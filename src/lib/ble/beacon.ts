/**
 * Stall sign BLE advert — matches `firmware/stall-sign/BEACON.md`.
 * Manufacturer company 0x0BAB, payload `[version][status][agent id]`.
 * Local name: `MolbhavA-<agent id>`.
 */

export const BEACON_VERSION = 1;
/** Company id in manufacturer data (little-endian on air: AB 0B). */
export const BEACON_COMPANY_ID = 0x0bab;

/** Status bytes a phone may ask: open (1), in a deal (3). Closed (0) and paused (2) are not. */
const ASKABLE = new Set([1, 3]);

const AGENT_ID = /^agent_[0-9a-f]{10}$/;

export type StallBeacon = {
  id: string;
  /** False when the sign says closed or paused — drop it from nearby. */
  askable: boolean;
};

function idFromPayload(data: Uint8Array): string | null {
  if (data.length < 3 || data[0] !== BEACON_VERSION) return null;
  const id = new TextDecoder().decode(data.subarray(2)).replace(/\0+$/, "").trim();
  return AGENT_ID.test(id) ? id : null;
}

/**
 * Stall one advert speaks for.
 * Status comes only from manufacturer data — name alone is never enough to offer a stall
 * (a closed sign still broadcasts its name).
 */
export function stallInAdvert(advert: {
  name?: string | null;
  data: Uint8Array[];
}): StallBeacon | null {
  for (const data of advert.data) {
    const id = idFromPayload(data);
    if (!id) continue;
    return { id, askable: ASKABLE.has(data[1]!) };
  }
  // The name alone carries no status (a closed sign still broadcasts it), so it never offers a stall.
  return null;
}

/** Askable agent id only (open / in-deal). Null when closed, paused, or not a Molbhav sign. */
export function agentInAdvert(advert: { name?: string | null; data: Uint8Array[] }) {
  const stall = stallInAdvert(advert);
  return stall?.askable ? stall.id : null;
}
