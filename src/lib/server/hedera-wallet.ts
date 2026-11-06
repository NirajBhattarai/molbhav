import "server-only";
import { WalletType } from "@magic-sdk/admin";
import { magicAdmin } from "@/lib/server/auth";
import { redis, redisConfigured } from "@/lib/server/redis";
import { HEDERA_MAINNET, isHederaId, type HederaNet } from "@/lib/x402";

/*
 * A user's Magic Hedera account (`0.0.x`): the account their Magic wallet signs for, so the one
 * they can spend from and the one their profile shows. It is not the `did:ethr:0x…` address in
 * their user id: that is a different (secp256k1) key, and HBAR sent to it can't be spent through
 * Magic. Read from Magic's admin API and cached a day (an account id never changes).
 *
 *   hedera:account:{network}:{user id}   1 day
 */

type MagicWallet = { wallet_type?: string; public_address?: string; network?: string };

export async function magicHederaAccountOf(
  userId: string,
  network: HederaNet,
): Promise<string | null> {
  const key = `hedera:account:${network}:${userId}`;
  if (redisConfigured()) {
    const hit = await (await redis()).get(key).catch(() => null);
    if (hit) return hit;
  }
  const magic = await magicAdmin();
  const meta = await magic.users.getMetadataByIssuerAndWallet(userId, WalletType.HEDERA);
  const want = network === HEDERA_MAINNET ? "MAINNET" : "TESTNET";
  const wallets = (meta.wallets ?? []) as MagicWallet[];
  const account = wallets.find(
    (w) =>
      w.wallet_type === "HEDERA" &&
      (w.network ?? "").toUpperCase().includes(want) &&
      isHederaId(w.public_address),
  )?.public_address;
  if (!account) return null;
  if (redisConfigured()) await (await redis()).set(key, account, { EX: 86_400 }).catch(() => {});
  return account;
}

/** A Hedera account id as its "long-zero" EVM address (0.0.123 → 0x000…07b), for ENS records. */
export function longZeroAddress(account: string): `0x${string}` {
  const [shard, realm, num] = account.split(".").map(BigInt);
  if (shard !== BigInt(0) || realm !== BigInt(0))
    throw new Error(`not a 0.0.x account: ${account}`);
  return `0x${num.toString(16).padStart(40, "0")}`;
}
