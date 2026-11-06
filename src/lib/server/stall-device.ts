import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/server/db";

export type DeviceStatus = "open" | "closed" | "paused";

const AGENT_ID = /^agent_[0-9a-f]{10}$/;

export function isDeviceStatus(v: unknown): v is DeviceStatus {
  return v === "open" || v === "closed" || v === "paused";
}

/** Per-stall bearer token the sign sends (HMAC of SESSION_SECRET + agent id). */
export function stallDeviceToken(agentId: string): string {
  const secret = (process.env.SESSION_SECRET ?? "").trim();
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret)
    .update(`molbhav-device:${agentId}`)
    .digest("hex")
    .slice(0, 32);
}

function tokensMatch(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

/** True when the Bearer token is valid for this agent id. */
export function authorizeDevice(agentId: string, bearer: string | null): boolean {
  if (!AGENT_ID.test(agentId) || !bearer) return false;
  try {
    if (tokensMatch(bearer, stallDeviceToken(agentId))) return true;
  } catch {
    /* SESSION_SECRET missing */
  }
  // Optional shared secret for early signs provisioned with one token.
  const shared = (process.env.STALL_DEVICE_SECRET ?? "").trim();
  return shared.length >= 8 && tokensMatch(bearer, shared);
}

type StallRow = {
  id: string;
  name: string;
  upi_id: string | null;
  lat: number | null;
  lng: number | null;
  has_menu: boolean;
  device_status: DeviceStatus;
  pause_until: Date | null;
  is_open: boolean;
};

/** Name + UPI + pin + at least one menu item — same gate as the shop "Open" toggle. */
export function stallReady(stall: {
  name: string;
  upi_id: string | null;
  lat: number | null;
  lng: number | null;
  has_menu: boolean;
}) {
  return (
    stall.name.trim() !== "" &&
    stall.upi_id != null &&
    stall.upi_id !== "" &&
    stall.lat != null &&
    stall.lng != null &&
    stall.has_menu
  );
}

async function stallByAgent(agentId: string): Promise<StallRow | null> {
  const [row] = await query<StallRow>(
    `SELECT id, name, upi_id, lat, lng, device_status, pause_until, is_open,
       EXISTS (
         SELECT 1 FROM stall_items i WHERE i.stall_id = stalls.id AND i.active
       ) AS has_menu
     FROM stalls WHERE agent_id = $1`,
    [agentId],
  );
  return row ?? null;
}

function pauseSecondsLeft(until: Date | null): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until.getTime() - Date.now()) / 1000));
}

/** Body the sign expects from GET state / POST status replies. */
export function deviceStateBody(
  stall: Pick<StallRow, "name" | "upi_id" | "device_status" | "pause_until">,
) {
  let status: DeviceStatus = stall.device_status;
  const pauseLeft = pauseSecondsLeft(stall.pause_until);
  // Pause expired → treat as open for the sign.
  if (status === "paused" && pauseLeft === 0) status = "open";
  return {
    status,
    pauseSecondsLeft: status === "paused" ? pauseLeft : 0,
    stallName: stall.name,
    upiId: stall.upi_id ?? "",
    deal: null as null,
  };
}

/**
 * Apply a button press from the sign: update device_status and is_open.
 * Buyers see Open only when status is open. Incomplete stalls stay closed.
 */
export async function applyDeviceStatus(
  agentId: string,
  status: DeviceStatus,
  pauseMinutes?: number,
): Promise<ReturnType<typeof deviceStateBody> | null> {
  const stall = await stallByAgent(agentId);
  if (!stall) return null;

  // Sign can always close. Open / pause only after the shop checklist is done.
  let next: DeviceStatus = status;
  if (next !== "closed" && !stallReady(stall)) next = "closed";

  const open = next === "open";
  const minutes = Math.min(120, Math.max(1, Math.round(Number(pauseMinutes) || 10)));
  const pauseUntil = next === "paused" ? new Date(Date.now() + minutes * 60_000) : null;

  const [row] = await query<StallRow>(
    `UPDATE stalls
     SET device_status = $2,
         pause_until = $3,
         is_open = $4,
         updated_at = now()
     WHERE agent_id = $1
     RETURNING id, name, upi_id, lat, lng, device_status, pause_until, is_open,
       EXISTS (
         SELECT 1 FROM stall_items i WHERE i.stall_id = stalls.id AND i.active
       ) AS has_menu`,
    [agentId, next, pauseUntil, open],
  );
  return row ? deviceStateBody(row) : null;
}

export async function readDeviceState(agentId: string) {
  const stall = await stallByAgent(agentId);
  if (!stall) return null;

  // Incomplete stall must not stay open/paused from an earlier bad push.
  if (!stallReady(stall) && stall.device_status !== "closed") {
    return applyDeviceStatus(agentId, "closed");
  }

  // Expire pause on read so buyers and the sign agree.
  if (stall.device_status === "paused" && pauseSecondsLeft(stall.pause_until) === 0) {
    return applyDeviceStatus(agentId, "open");
  }
  return deviceStateBody(stall);
}

export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)/i.exec(header.trim());
  return m?.[1] ?? null;
}
