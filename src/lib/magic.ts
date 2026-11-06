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

type MirrorAccount = {
  account?: string;
  key?: { key?: string } | null;
  balance?: { balance?: number };
};

/** Hex with no `0x` and no DER prefix, lower case, for comparing keys. */
const rawKey = (k: string) => k.toLowerCase().replace(/^0x/, "");

/**
 * The Hedera account Magic pays from (`0.0.x`), its public key and its balance in tinybars. One
 * answer per page, shared by the profile and the pay button, so both always show the same account.
 *
 * Magic's own example pays from the user's Hedera account id and signs with
 * `magic.hedera.getPublicKey()`. That account must hold that key, or the signature can't count, so
 * every candidate is checked against the mirror node: Magic's account id first, then any account
 * the key controls (the richest one if there are several). The EVM address in `getInfo().wallets`
 * is a different (secp256k1) key and is never used to pay. Null until Magic has a Hedera account.
 */
export function magicHederaAccount(m: MolbhavMagic, network: HederaNetwork = hederaNetwork()) {
  hederaAccount ??= findHederaAccount(m, network).catch((err) => {
    hederaAccount = null;
    throw err;
  });
  return hederaAccount;
}

let hederaAccount: ReturnType<typeof findHederaAccount> | null = null;

async function findHederaAccount(m: MolbhavMagic, network: HederaNetwork) {
  const info = await m.hedera.getPublicKey();
  const der = typeof info === "string" ? info : info?.publicKeyDer;
  if (!der) return null;
  const { PublicKey } = await import("@hiero-ledger/sdk");
  const publicKey = PublicKey.fromString(der); // DER or raw hex
  const mine = rawKey(publicKey.toStringRaw());
  const mirror = mirrorNode(network);

  const candidates: string[] = [];
  if (typeof info === "object" && isHederaId(info?.accountId)) candidates.push(info.accountId);
  const user = await m.user.getInfo().catch(() => null);
  const named = user?.wallets?.hedera?.publicAddress;
  if (isHederaId(named)) candidates.push(named);

  for (const id of new Set(candidates)) {
    const res = await fetch(`${mirror}/api/v1/accounts/${id}`).catch(() => null);
    const a = res?.ok ? ((await res.json()) as MirrorAccount) : null;
    if (a?.key?.key && rawKey(a.key.key).endsWith(mine))
      return { accountId: id, publicKey, balance: BigInt(a.balance?.balance ?? 0) };
  }

  const res = await fetch(`${mirror}/api/v1/accounts?account.publickey=${mine}&limit=25`).catch(
    () => null,
  );
  const found = res?.ok ? ((await res.json()) as { accounts?: MirrorAccount[] }).accounts : [];
  const best = (found ?? [])
    .filter((a) => isHederaId(a.account))
    .sort((a, b) => (b.balance?.balance ?? 0) - (a.balance?.balance ?? 0))[0];
  return best?.account
    ? { accountId: best.account, publicKey, balance: BigInt(best.balance?.balance ?? 0) }
    : null;
}

/** Forget the paying account (sign-out, or after a payment changes its balance). */
export const forgetHederaAccount = () => {
  hederaAccount = null;
};

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
 * The buyer's Hedera wallet as shown on the profile: exactly the account the pay button pays from
 * (`0.0.x`), so it is the one to fund at the faucet. No EVM fallback: funding that address can't
 * be spent by Magic's Hedera key.
 */
export async function hederaWalletAddress(): Promise<string | null> {
  if (!key) return null;
  const m = await getMagic().catch(() => null);
  if (!m || !(await m.user.isLoggedIn().catch(() => false))) return null;
  const account = await magicHederaAccount(m).catch(() => null);
  return account?.accountId ?? null;
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
  forgetHederaAccount();
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
  forgetHederaAccount();
  if (!key) return;
  const m = await getMagic().catch(() => null);
  if (m && (await m.user.isLoggedIn().catch(() => false))) await m.user.logout().catch(() => {});
}
