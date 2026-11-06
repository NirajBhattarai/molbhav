import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/server/db";
import { withinLimit } from "@/lib/server/rate-limit";
import { stallDeviceToken } from "@/lib/server/stall-device";

const CHIP_ID = /^[0-9a-f]{8,16}$/;
const CLAIM_CODE = /^[0-9]{6}$/;
/** The sign's own random secret (hex), made on first boot and kept in its flash. */
const CLAIM_SECRET = /^[0-9a-f]{32,64}$/;
const CLAIM_TTL_MS = 15 * 60_000;
/** Wrong codes a shopkeeper may try before waiting: guessing one of a million takes forever. */
const CLAIM_TRIES = 10;
const CLAIM_TRIES_WINDOW_S = 15 * 60;

export function isChipId(v: string): boolean {
  return CHIP_ID.test(v);
}

export function isClaimCode(v: string): boolean {
  return CLAIM_CODE.test(v);
}

export function isClaimSecret(v: string): boolean {
  return CLAIM_SECRET.test(v);
}

export const hashClaimSecret = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

function sameHash(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

type ClaimRow = {
  chip_id: string;
  claim_code: string;
  stall_id: string | null;
  agent_id: string | null;
  expires_at: Date;
  claimed_at: Date | null;
  secret_hash: string | null;
};

const CLAIM_COLUMNS =
  "chip_id, claim_code, stall_id, agent_id, expires_at, claimed_at, secret_hash";

async function claimRow(chipId: string) {
  const [row] = await query<ClaimRow>(
    `SELECT ${CLAIM_COLUMNS} FROM sign_claims WHERE chip_id = $1`,
    [chipId],
  );
  return row ?? null;
}

/**
 * Sign calls this after joining Wi‑Fi, with its secret. Returns a fresh 6-digit code to show on the
 * OLED, or the stall credentials once a shopkeeper has claimed it.
 *
 * The chip id is the factory MAC, which anyone near the sign can work out, so it is never enough on
 * its own: only the secret the chip made on first boot gets a code or credentials for it.
 */
export async function registerSignChip(chipId: string, secret: string) {
  const id = chipId.toLowerCase();
  if (!isChipId(id)) return { error: "bad_chip" as const };
  if (!isClaimSecret(secret)) return { error: "bad_secret" as const };
  const hash = hashClaimSecret(secret);

  const existing = await claimRow(id);
  if (existing?.secret_hash && !sameHash(existing.secret_hash, hash)) {
    // Another secret owns this chip id. Only a code nobody claimed, left to expire, can be taken over.
    const abandoned = !existing.claimed_at && existing.expires_at.getTime() < Date.now();
    if (!abandoned) return { error: "forbidden" as const };
  }
  if (existing?.claimed_at && existing.agent_id) {
    if (!existing.secret_hash) {
      // Claimed before signs had secrets: the first secret to arrive becomes this chip's.
      await query(
        "UPDATE sign_claims SET secret_hash = $2 WHERE chip_id = $1 AND secret_hash IS NULL",
        [id, hash],
      );
      const adopted = await claimRow(id);
      if (!adopted?.secret_hash || !sameHash(adopted.secret_hash, hash))
        return { error: "forbidden" as const };
    }
    return credentialsFor(existing.agent_id);
  }

  // Retry a few times if the rare unique-code clash hits.
  for (let i = 0; i < 5; i++) {
    try {
      await query(
        `INSERT INTO sign_claims (chip_id, claim_code, expires_at, secret_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chip_id) DO UPDATE SET
           claim_code = EXCLUDED.claim_code,
           expires_at = EXCLUDED.expires_at,
           secret_hash = EXCLUDED.secret_hash,
           stall_id = NULL,
           agent_id = NULL,
           claimed_at = NULL,
           created_at = now()
         WHERE sign_claims.claimed_at IS NULL
           AND (sign_claims.secret_hash IS NULL
             OR sign_claims.secret_hash = EXCLUDED.secret_hash
             OR sign_claims.expires_at < now())`,
        [id, newCode(), new Date(Date.now() + CLAIM_TTL_MS), hash],
      );
      break;
    } catch {
      /* unique claim_code — try again */
    }
  }

  const row = await claimRow(id);
  if (!row) return { error: "register_failed" as const };
  // Lost a race to another secret, or someone claimed it meanwhile with a different one.
  if (!row.secret_hash || !sameHash(row.secret_hash, hash)) return { error: "forbidden" as const };
  if (row.claimed_at && row.agent_id) return credentialsFor(row.agent_id);

  return {
    status: "waiting" as const,
    claimCode: row.claim_code,
    expiresAt: row.expires_at.toISOString(),
  };
}

/** Sign polls with its secret until the shopkeeper has entered the code in the app. */
export async function pollSignClaim(chipId: string, secret: string) {
  const id = chipId.toLowerCase();
  if (!isChipId(id)) return { error: "bad_chip" as const };
  if (!isClaimSecret(secret)) return { error: "bad_secret" as const };

  const row = await claimRow(id);
  if (!row) return { status: "unknown" as const };
  if (!row.secret_hash || !sameHash(row.secret_hash, hashClaimSecret(secret)))
    return { error: "forbidden" as const };
  if (row.claimed_at && row.agent_id) return credentialsFor(row.agent_id);
  if (row.expires_at.getTime() < Date.now()) return { status: "expired" as const };
  return {
    status: "waiting" as const,
    claimCode: row.claim_code,
    expiresAt: row.expires_at.toISOString(),
  };
}

async function credentialsFor(agentId: string) {
  const [stall] = await query<{ name: string; upi_id: string | null }>(
    `SELECT name, upi_id FROM stalls WHERE agent_id = $1`,
    [agentId],
  );
  if (!stall) return { error: "missing_stall" as const };
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return {
    status: "claimed" as const,
    agentId,
    deviceToken: stallDeviceToken(agentId),
    stallName: stall.name,
    server: base || undefined,
  };
}

/** Shopkeeper binds a waiting chip to their stall using the OLED code. */
export async function claimSignWithCode(userId: string, claimCode: string) {
  const code = claimCode.trim();
  if (!isClaimCode(code)) return { error: "Enter the 6-digit code from the sign’s screen." };
  if (!(await withinLimit(`sign-claim:${userId}`, CLAIM_TRIES, CLAIM_TRIES_WINDOW_S)))
    return { error: "Too many tries. Wait 15 minutes, then enter the code on the sign." };

  const [stall] = await query<{ id: string; agent_id: string | null; name: string }>(
    `SELECT id, agent_id, name FROM stalls WHERE owner_id = $1`,
    [userId],
  );
  if (!stall?.agent_id) {
    return { error: "Add your UPI on the shop first so the stall has an agent id." };
  }

  const [row] = await query<ClaimRow>(
    `SELECT ${CLAIM_COLUMNS} FROM sign_claims WHERE claim_code = $1 AND claimed_at IS NULL`,
    [code],
  );
  if (!row)
    return { error: "That code isn’t waiting. Power the sign, join Wi‑Fi, and try the new code." };
  if (row.expires_at.getTime() < Date.now()) {
    return { error: "That code expired. Wait for a new one on the sign, then try again." };
  }

  await query(
    `UPDATE sign_claims
     SET stall_id = $2, agent_id = $3, claimed_at = now()
     WHERE chip_id = $1 AND claimed_at IS NULL`,
    [row.chip_id, stall.id, stall.agent_id],
  );

  return {
    ok: true as const,
    chipId: row.chip_id,
    agentId: stall.agent_id,
    stallName: stall.name,
  };
}

/**
 * Offline claim pack for the hotspot page (phone has no internet while on the sign AP).
 * Format the ESP32 can parse: mb1|agentId|token|server|stallName
 */
export function buildClaimPack(input: {
  agentId: string;
  deviceToken: string;
  server: string;
  stallName: string;
}) {
  const name = input.stallName.replace(/\|/g, " ").trim() || "Molbhav Stall";
  return `mb1|${input.agentId}|${input.deviceToken}|${input.server.replace(/\/$/, "")}|${name}`;
}

export function parseClaimPack(raw: string): {
  agentId: string;
  deviceToken: string;
  server: string;
  stallName: string;
} | null {
  const parts = raw.trim().split("|");
  if (parts.length < 4 || parts[0] !== "mb1") return null;
  const [, agentId, deviceToken, server, ...nameParts] = parts;
  if (!agentId || !deviceToken || !server) return null;
  if (!/^agent_[0-9a-f]{10}$/.test(agentId)) return null;
  return {
    agentId,
    deviceToken,
    server: server.replace(/\/$/, ""),
    stallName: (nameParts.join("|").trim() || "Molbhav Stall").slice(0, 40),
  };
}
