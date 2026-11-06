/**
 * Stall sign BLE advert — matches `firmware/stall-sign/BEACON.md`.
 * Capacitor strips the 2-byte company id; payload is `[version][status][agent id]`.
 */

export const BEACON_VERSION = 1;
export const BEACON_COMPANY_ID = 0x0bab;

/** Open (1) and in-deal (3) may be asked; closed (0) and paused (2) must not. */
const ASKABLE = new Set([1, 3]);

const AGENT_ID = /^agent_[0-9a-f]{10}$/;
const NAME = /^MolbhavA-(agent_[0-9a-f]{10})$/i;

export type StallBeacon = {
  id: string;
  askable: boolean;
};

/** Normalize Capacitor DataView / Uint8Array / number[] into bytes. */
export function asBytes(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  return null;
}

/**
 * Payload after company id is stripped. Also accepts a full buffer that still
 * starts with 0xAB 0x0B (some stacks don't strip).
 */
function payloadOf(raw: Uint8Array): Uint8Array | null {
  if (raw.length >= 4 && raw[0] === 0xab && raw[1] === 0x0b) return raw.subarray(2);
  if (raw.length >= 2) return raw;
  return null;
}

function parsePayload(raw: Uint8Array): StallBeacon | null {
  const data = payloadOf(raw);
  if (!data || data.length < 3 || data[0] !== BEACON_VERSION) return null;
  const id = new TextDecoder().decode(data.subarray(2)).replace(/\0+$/, "").trim();
  if (!AGENT_ID.test(id)) return null;
  return { id, askable: ASKABLE.has(data[1]!) };
}

/**
 * Stall one advert speaks for.
 * Status is only in manufacturer data — never treat the local name alone as open
 * (closed signs still broadcast `MolbhavA-<id>`).
 */
export function stallInAdvert(advert: {
  name?: string | null;
  data: unknown[];
}): StallBeacon | null {
  for (const chunk of advert.data) {
    const bytes = asBytes(chunk);
    if (!bytes) continue;
    const stall = parsePayload(bytes);
    if (stall) return stall;
  }
  // Name without a status payload: unknown — do not offer.
  if (advert.name?.trim().match(NAME)) return null;
  return null;
}

/** Askable agent id only. */
export function agentInAdvert(advert: { name?: string | null; data: unknown[] }) {
  const stall = stallInAdvert(advert);
  return stall?.askable ? stall.id : null;
}
