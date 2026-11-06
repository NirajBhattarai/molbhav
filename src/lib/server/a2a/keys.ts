import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from "node:crypto";
import { canonicalOffer, type Offer } from "@/lib/a2a/protocol";

/*
 * Each stall agent signs its offers with its own Ed25519 key. The key is derived
 * from one server secret and the agent id (HKDF), so nothing is stored and every server instance
 * derives the same key. The public half is on the agent's card: anyone can check an offer, which is
 * how a stall can trust a rival's offer that a buyer forwards.
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

export function signOffer(offer: Omit<Offer, "sig">, privateKey: KeyObject): Offer {
  return {
    ...offer,
    sig: sign(null, Buffer.from(canonicalOffer(offer)), privateKey).toString("base64url"),
  };
}

/** True when `offer` is unaltered and signed by the holder of `publicKey`. */
export function verifyOffer(offer: Offer, publicKey: string): boolean {
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: publicKey },
      format: "jwk",
    });
    return verify(
      null,
      Buffer.from(canonicalOffer(offer)),
      key,
      Buffer.from(String(offer.sig), "base64url"),
    );
  } catch {
    return false;
  }
}

/**
 * Molbhav's own A2A clients (the app's buyer agent, the market's shop-around) say who they are with
 * `X-Molbhav-Client: <role>.<HMAC>`, so the stall agents can tell them from outside agents: they skip
 * the rate limit, and a deal the app's buyer agent makes is recorded by the app, not again by the stall.
 */
export type InternalRole = "app" | "market";
export const INTERNAL_HEADER = "X-Molbhav-Client";

const roleMac = (role: string) =>
  createHmac("sha256", a2aSecret()).update(`molbhav-a2a-client:${role}`).digest("base64url");

export const internalToken = (role: InternalRole) => `${role}.${roleMac(role)}`;

/** The role a request's header proves, or null for anyone else. */
export function internalRole(header: string | null): InternalRole | null {
  if (!header || !a2aSecret()) return null;
  const [role, mac] = header.split(".");
  if (role !== "app" && role !== "market") return null;
  const want = Buffer.from(roleMac(role));
  const got = Buffer.from(mac ?? "");
  return got.length === want.length && timingSafeEqual(got, want) ? role : null;
}
