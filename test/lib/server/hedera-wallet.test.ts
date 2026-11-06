import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/redis", () => ({ redisConfigured: () => false, redis: vi.fn() }));
const getMetadataByIssuerAndWallet = vi.fn();
vi.mock("@/lib/server/auth", () => ({
  magicAdmin: async () => ({ users: { getMetadataByIssuerAndWallet } }),
}));

import { longZeroAddress, magicHederaAccountOf } from "@/lib/server/hedera-wallet";

const SOYEB = "did:ethr:0x2E8d9978D48f18eb34AD0D6c5c9E2B2B5c006516";

beforeEach(() => getMetadataByIssuerAndWallet.mockReset());

describe("magicHederaAccountOf", () => {
  it("reads the user's Hedera account for this network from Magic", async () => {
    getMetadataByIssuerAndWallet.mockResolvedValue({
      publicAddress: "0x2E8d9978D48f18eb34AD0D6c5c9E2B2B5c006516",
      wallets: [
        { wallet_type: "HEDERA", public_address: "0.0.11328748", network: "CANONICAL_TESTNET" },
      ],
    });
    await expect(magicHederaAccountOf(SOYEB, "hedera:testnet")).resolves.toBe("0.0.11328748");
    await expect(magicHederaAccountOf(SOYEB, "hedera:mainnet")).resolves.toBeNull();
    expect(getMetadataByIssuerAndWallet).toHaveBeenCalledWith(SOYEB, "HEDERA");
  });

  it("is null when Magic has no Hedera wallet for them", async () => {
    getMetadataByIssuerAndWallet.mockResolvedValue({ wallets: null });
    await expect(magicHederaAccountOf(SOYEB, "hedera:testnet")).resolves.toBeNull();
  });
});

it("writes an account id as its long-zero EVM address", () => {
  expect(longZeroAddress("0.0.11328748")).toBe("0x0000000000000000000000000000000000acdcec");
  expect(() => longZeroAddress("1.0.5")).toThrow();
});
