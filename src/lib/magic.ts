"use client";

import type { Magic as MagicType } from "magic-sdk";
import { isHederaId } from "@/lib/x402";

export type HederaNetwork = "testnet" | "mainnet";

/** Magic with its Hedera extension: the wallet signs Hedera transactions in the browser. */
export type MolbhavMagic = MagicType & {
  hedera: {
    getPublicKey: () => Promise<{ publicKeyDer?: string; accountId?: string } | string | null>;
    sign: (message: Uint8Array) => Promise<unknown>;
  };
};

const key = (process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY ?? "").trim();

export const magicConfigured = () => Boolean(key);

export const hederaNetwork = (): HederaNetwork =>
  (process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? "testnet").trim().toLowerCase() === "mainnet"
    ? "mainnet"
    : "testnet";

/** "0x12ab…9f3c" */
export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** HashScan page for a Hedera account id (`0.0.x`) or EVM alias (`0x…`). */
export function hashscanAccountUrl(address: string, network: HederaNetwork = hederaNetwork()) {
  const net = network === "mainnet" ? "mainnet" : "testnet";
  return `https://hashscan.io/${net}/account/${encodeURIComponent(address)}`;
}

export const mirrorNode = (network: HederaNetwork = hederaNetwork()) =>
  network === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";

/**
 * The Hedera account Magic signs for (`0.0.x`) and its public key. This is the account that pays,
 * and it is not the EVM address in `getInfo().wallets`: that one is a different (secp256k1) key.
 * Null until Magic has a Hedera account for this sign-in.
 */
export async function magicHederaAccount(
  m: MolbhavMagic,
  network: HederaNetwork = hederaNetwork(),
) {
  const info = await m.hedera.getPublicKey();
  const der = typeof info === "string" ? info : info?.publicKeyDer;
  if (!der) return null;
  const { PublicKey } = await import("@hiero-ledger/sdk");
  const publicKey = PublicKey.fromString(der); // DER or raw hex
  let accountId = typeof info === "object" ? info?.accountId : undefined;
  if (!isHederaId(accountId)) {
    const res = await fetch(
      `${mirrorNode(network)}/api/v1/accounts?account.publickey=${publicKey.toStringRaw()}`,
    );
    const found = res.ok ? ((await res.json()) as { accounts?: { account?: string }[] }) : null;
    accountId = found?.accounts?.[0]?.account;
  }
  return isHederaId(accountId) ? { accountId, publicKey } : null;
}

let magic: Promise<MolbhavMagic> | null = null;

/** One Magic per page, loaded only when someone signs in, out, or reads their Hedera wallet. */
export function getMagic(): Promise<MolbhavMagic> {
  magic ??= (async () => {
    const [{ Magic }, { HederaExtension }] = await Promise.all([
      import("magic-sdk"),
      import("@magic-ext/hedera"),
    ]);
    return new Magic(key, {
      extensions: [new HederaExtension({ network: hederaNetwork() })],
    }) as unknown as MolbhavMagic;
  })().catch((err) => {
    magic = null;
    throw err;
  });
  return magic;
}

/**
 * The buyer's Hedera wallet as shown on the profile: the account Magic pays from (`0.0.x`), so that
 * is the one people fund at the faucet. Falls back to the address in Magic's user info.
 */
export async function hederaWalletAddress(): Promise<string | null> {
  if (!key) return null;
  const m = await getMagic().catch(() => null);
  if (!m || !(await m.user.isLoggedIn().catch(() => false))) return null;
  const account = await magicHederaAccount(m).catch(() => null);
  if (account) return account.accountId;
  const info = await m.user.getInfo().catch(() => null);
  const wallets = info?.wallets as
    { hedera?: { publicAddress?: string }; ethereum?: { publicAddress?: string } } | undefined;
  return wallets?.hedera?.publicAddress ?? wallets?.ethereum?.publicAddress ?? null;
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
