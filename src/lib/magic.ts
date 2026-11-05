"use client";

import type { Magic as MagicType } from "magic-sdk";

const key = (process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY ?? "").trim();

export const magicConfigured = () => Boolean(key);

let magic: Promise<MagicType> | null = null;

/** One Magic per page, loaded only when someone signs in or out. */
export function getMagic(): Promise<MagicType> {
  magic ??= (async () => {
    const { Magic } = await import("magic-sdk");
    return new Magic(key);
  })().catch((err) => {
    magic = null;
    throw err;
  });
  return magic;
}

export type OtpEvent =
  | { type: "code-sent" }
  | { type: "invalid-code" }
  | { type: "expired-code" }
  | { type: "approve-device" }
  | { type: "done"; token: string }
  | { type: "failed"; message: string };

export type OtpSession = { submit: (code: string) => void; cancel: () => void };

export class OtpError extends Error {
  constructor(readonly msg: string) {
    super(msg);
  }
}

export async function startEmailOtp(
  email: string,
  onEvent: (e: OtpEvent) => void,
): Promise<OtpSession> {
  if (!key) throw new OtpError("Sign-in isn't set up yet.");
  const m = await getMagic().catch(() => {
    throw new OtpError("Couldn't reach the sign-in service. Check your connection and try again.");
  });
  if (await m.user.isLoggedIn().catch(() => false)) await m.user.logout().catch(() => {});
  const handle = m.auth.loginWithEmailOTP({ email, showUI: false, deviceCheckUI: false });
  let finished = false;
  const fail = (message: string) => {
    if (finished) return;
    finished = true;
    onEvent({ type: "failed", message });
  };

  handle
    .on("email-otp-sent", () => onEvent({ type: "code-sent" }))
    .on("invalid-email-otp", () => onEvent({ type: "invalid-code" }))
    .on("expired-email-otp", () => onEvent({ type: "expired-code" }))
    .on("max-attempts-reached", () => fail("Too many wrong codes. Send a new code to try again."))
    .on("login-throttled", () =>
      fail("Too many sign-ins in a short time. Wait a minute, then try again."),
    )
    .on("device-needs-approval", () => onEvent({ type: "approve-device" }))
    .on("device-verification-email-sent", () => onEvent({ type: "approve-device" }))
    .on("device-verification-link-expired", () => handle.emit("device-retry"))
    .on("done", async () => {
      if (finished) return;
      finished = true;
      const token = await m.user.getIdToken({ lifespan: 300 }).catch(() => null);
      onEvent(
        token
          ? { type: "done", token }
          : { type: "failed", message: "Sign-in didn't finish. Please try again." },
      );
    })
    .on("error", (err: unknown) =>
      fail(err instanceof Error ? err.message : "Sign-in didn't finish. Please try again."),
    );

  return {
    submit: (code) => handle.emit("verify-email-otp", code),
    cancel: () => {
      finished = true;
      handle.emit("cancel");
    },
  };
}

export async function signOutOfMagic() {
  if (!key) return;
  const m = await getMagic().catch(() => null);
  if (m && (await m.user.isLoggedIn().catch(() => false))) await m.user.logout().catch(() => {});
}
