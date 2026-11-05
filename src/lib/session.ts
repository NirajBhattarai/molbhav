import { createHmac, timingSafeEqual } from "node:crypto";

// Signed session: Magic issuer + email + expiry, sealed with SESSION_SECRET.

export type Session = { user: string; email: string; exp: number };

function mac(body: string) {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** "<payload>.<signature>", both base64url. */
export function sealSession(user: string, email: string, maxAge: number) {
  const session: Session = { user, email, exp: Math.floor(Date.now() / 1000) + maxAge };
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The session in a cookie, or null when it's missing, forged, or expired. */
export function openSession(value: string | undefined): Session | null {
  const [body, sig, extra] = value?.split(".") ?? [];
  if (!body || !sig || extra !== undefined) return null;
  try {
    const want = Buffer.from(mac(body));
    const got = Buffer.from(sig);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const session = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    return session.exp > Date.now() / 1000 ? session : null;
  } catch {
    return null;
  }
}
