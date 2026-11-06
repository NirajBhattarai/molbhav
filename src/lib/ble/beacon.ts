/**
 * Stall sign BLE advert — matches `firmware/stall-sign/BEACON.md`.
 * Capacitor strips the 2-byte company id; payload is `[version][status][agent id]`.
 * The scan response's local name is the stall's ENS label when it has one that fits
 * (`mohd-soyeb-khan` → mohd-soyeb-khan.molbhav.eth), else `MolbhavA-<agent id>`.
 */

export const BEACON_VERSION = 1;
export const BEACON_COMPANY_ID = 0x0bab;

/** The market's ENS name (ENS_PARENT_DEFAULT in lib/ens; kept here so phones skip viem's normalizer). */
export const BEACON_ENS_PARENT = "molbhav.eth";

/** A scan response holds 31 bytes; the local name's own header takes 2. */
export const BEACON_LABEL_MAX = 29;

/** Open (1) and in-deal (3) may be asked; closed (0) and paused (2) must not. */
const ASKABLE = new Set([1, 3]);

const AGENT_ID = /^agent_[0-9a-f]{10}$/;
const NAME = /^MolbhavA-(agent_[0-9a-f]{10})$/i;
/** An ENS label as stallLabel makes them: lowercase ASCII words joined by single hyphens. */
const LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type StallBeacon = {
  id: string;
  askable: boolean;
  /** The stall's ENS name, from the label in its scan response; null when it sent none. */
  ens: string | null;
};

/** The label a sign should broadcast as its name, or null when it doesn't fit (or isn't one). */
export function beaconLabel(label: string | null | undefined): string | null {
  if (!label || label.length < 3 || label.length > BEACON_LABEL_MAX) return null;
  return LABEL.test(label) ? label : null;
}

/** A heard local name as the stall's ENS name, or null (the `MolbhavA-` name, noise). */
export function ensInName(name: string | null | undefined): string | null {
  const label = beaconLabel(name?.trim());
  return label ? `${label}.${BEACON_ENS_PARENT}` : null;
}

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
  return { id, askable: ASKABLE.has(data[1]!), ens: null };
}

/**
 * Stall one advert speaks for.
 * Status is only in manufacturer data — never treat the local name alone as open
 * (closed signs still broadcast `MolbhavA-<id>`). The name only adds the ENS name to a stall the
 * manufacturer data already found; a phone's buyer agent checks that name against ENS.
 */
export function stallInAdvert(advert: {
  name?: string | null;
  data: unknown[];
}): StallBeacon | null {
  for (const chunk of advert.data) {
    const bytes = asBytes(chunk);
    if (!bytes) continue;
    const stall = parsePayload(bytes);
    if (stall) return { ...stall, ens: ensInName(advert.name) };
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
