"use server";

import { cookies } from "next/headers";
import { ROLE_COOKIE, SESSION_COOKIE } from "@/lib/access";
import { verifyMagicToken } from "@/lib/server/auth";
import { sealSession } from "@/lib/session";

const MONTH = 60 * 60 * 24 * 30;

/** After the email code: turns Magic's DID token into Molbhav's own session cookie. */
export async function startSession(didToken: string): Promise<{ ok: true } | { error: string }> {
  if (!process.env.MAGIC_SECRET_KEY?.trim() || !process.env.SESSION_SECRET?.trim()) {
    return { error: "Sign-in isn't set up yet." };
  }
  try {
    const { issuer, email } = await verifyMagicToken(didToken);
    (await cookies()).set(SESSION_COOKIE, sealSession(issuer, email, MONTH), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MONTH,
    });
    return { ok: true };
  } catch (err) {
    console.error("startSession", err);
    return { error: "Sign-in didn't finish. Please try again." };
  }
}

/** Signs out on this device: the session is httpOnly, so only the server can remove it. */
export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ROLE_COOKIE);
}
