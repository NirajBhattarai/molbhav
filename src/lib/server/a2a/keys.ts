import "server-only";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  type KeyObject,
} from "node:crypto";

/*
 * Each stall agent signs offers with its own Ed25519 key, derived from one server secret and the
 * agent id (HKDF). Nothing is stored; every instance derives the same key. The public half goes on
 * the Agent Card as offerKey.
 *   A2A_SIGNING_SECRET, else derived from SESSION_SECRET.
 */

export function a2aSecret(): string {
  const own = (process.env.A2A_SIGNING_SECRET ?? "").trim();
  if (own) return own;
  const session = (process.env.SESSION_SECRET ?? "").trim();
  return session ? createHash("sha256").update(`molbhav-a2a:${session}`).digest("hex") : "";
}

/** PKCS#8 DER prefix for a raw 32-byte Ed25519 seed. */
const ED25519_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const cache = new Map<string, { privateKey: KeyObject; publicKey: string }>();

/** The agent's key pair; `publicKey` is raw Ed25519, base64url (the JWK `x`). */
export function agentKeys(agentId: string) {
  const secret = a2aSecret();
  if (!secret) throw new Error("A2A needs A2A_SIGNING_SECRET (or SESSION_SECRET) on the server");
  const hit = cache.get(agentId);
  if (hit) return hit;
  const seed = Buffer.from(hkdfSync("sha256", secret, "molbhav-a2a", `offer-key:${agentId}`, 32));
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8, seed]),
    format: "der",
    type: "pkcs8",
  });
  const { x } = createPublicKey(privateKey).export({ format: "jwk" }) as { x: string };
  const keys = { privateKey, publicKey: x };
  cache.set(agentId, keys);
  return keys;
}
