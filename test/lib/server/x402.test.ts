import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/server/redis", () => ({ redisConfigured: () => false, redis: vi.fn() }));
vi.mock("@/lib/server/chat-cache", () => ({ wroteChat: vi.fn() }));
vi.mock("@/lib/server/a2a/client", () => ({ appBase: () => "https://molbhav.test" }));
vi.mock("@/lib/server/ens", () => ({ hederaAddressFromEns: vi.fn() }));
vi.mock("@/lib/server/hedera-wallet", () => ({ magicHederaAccountOf: vi.fn() }));
vi.mock("@/lib/server/limits", () => ({ payingBreaks: vi.fn(async () => null) }));
vi.mock("@/lib/server/auto-order", () => ({ orderPaid: vi.fn() }));

const facilitator = { getSupported: vi.fn(), verify: vi.fn(), settle: vi.fn() };
vi.mock("@x402/core/http", () => ({
  HTTPFacilitatorClient: class {
    getSupported = facilitator.getSupported;
    verify = facilitator.verify;
    settle = facilitator.settle;
  },
}));

import { query } from "@/lib/server/db";
import { hederaAddressFromEns } from "@/lib/server/ens";
import { magicHederaAccountOf } from "@/lib/server/hedera-wallet";
import { orderPaid } from "@/lib/server/auto-order";
import { payingBreaks } from "@/lib/server/limits";
import type { PaymentPayload } from "@x402/core/types";
import { quoteDeal, settleDeal, stallPayTo } from "@/lib/server/x402";

const BARGAIN = "11111111-2222-3333-4444-555555555555";
const SOYEB_EVM = "0x2E8d9978D48f18eb34AD0D6c5c9E2B2B5c006516";
const SOYEB_HEDERA = "0.0.11328748"; // his Magic Hedera account, the one he can spend from
const deal = {
  stall_id: "u-6c5846d7",
  stall_name: "MOHD SOYEB KHAN",
  owner_id: `did:ethr:${SOYEB_EVM}`,
  ens_label: "mohd-soyeb-khan",
  ens_status: "live",
  item: "Veg Biryani",
  current: 150,
  status: "agreed",
  paid_tx: null,
};

const mirror = (account: string | null) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify(account ? { account } : {}), { status: account ? 200 : 404 }),
    );

beforeEach(() => {
  vi.mocked(query).mockReset();
  Object.values(facilitator).forEach((f) => f.mockReset());
  facilitator.getSupported.mockResolvedValue({
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: "hedera:testnet",
        extra: { feePayer: "0.0.9185802" },
      },
    ],
  });
  vi.mocked(hederaAddressFromEns).mockReset().mockResolvedValue(SOYEB_EVM);
  vi.mocked(magicHederaAccountOf).mockReset().mockResolvedValue(SOYEB_HEDERA);
  delete process.env.X402_INR_PER_HBAR;
});

describe("stallPayTo", () => {
  it("pays the owner's Magic Hedera account, the one they can spend", async () => {
    await expect(stallPayTo(deal)).resolves.toEqual({ account: SOYEB_HEDERA, via: "wallet" });
    expect(magicHederaAccountOf).toHaveBeenCalledWith(deal.owner_id, "hedera:testnet");
    expect(hederaAddressFromEns).not.toHaveBeenCalled();
  });

  it("falls back to the stall's ENS Hedera address only when Magic can't say", async () => {
    vi.mocked(magicHederaAccountOf).mockRejectedValue(new Error("magic down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mirror(SOYEB_HEDERA);
    await expect(stallPayTo(deal)).resolves.toEqual({ account: SOYEB_HEDERA, via: "ens" });
  });

  it("never pays the owner's EVM address", async () => {
    vi.mocked(magicHederaAccountOf).mockResolvedValue(null);
    await expect(stallPayTo({ ...deal, ens_status: null })).resolves.toBeNull();
  });
});

describe("quoteDeal", () => {
  it("asks for the agreed price in HBAR, to the stall, fees on the facilitator", async () => {
    vi.mocked(query).mockResolvedValueOnce([deal]);
    const quote = await quoteDeal(BARGAIN, deal.stall_id, "buyer");
    expect(quote.ok && quote.required).toMatchObject({
      x402Version: 2,
      resource: { url: `https://molbhav.test/api/bargains/${BARGAIN}/u-6c5846d7/pay` },
      accepts: [
        {
          scheme: "exact",
          network: "hedera:testnet",
          asset: "0.0.0",
          amount: "1000000000", // ₹150 at ₹15/HBAR = 10 HBAR
          payTo: SOYEB_HEDERA,
          extra: { feePayer: "0.0.9185802" },
        },
      ],
    });
  });

  it("won't take money for a deal that isn't agreed, or is paid", async () => {
    vi.mocked(query).mockResolvedValueOnce([{ ...deal, status: "haggling" }]);
    await expect(quoteDeal(BARGAIN, deal.stall_id, "buyer")).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    vi.mocked(query).mockResolvedValueOnce([{ ...deal, status: "paid" }]);
    await expect(quoteDeal(BARGAIN, deal.stall_id, "buyer")).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    vi.mocked(query).mockResolvedValueOnce([]);
    await expect(quoteDeal(BARGAIN, deal.stall_id, "someone-else")).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

it("won't quote a deal over the buyer's limits", async () => {
  vi.mocked(query).mockResolvedValueOnce([deal]);
  vi.mocked(payingBreaks).mockResolvedValueOnce({ kind: "order", limit: 100 });
  await expect(quoteDeal(BARGAIN, deal.stall_id, "buyer")).resolves.toMatchObject({
    ok: false,
    status: 403,
  });
});

describe("settleDeal", () => {
  const accepted = {
    scheme: "exact",
    network: "hedera:testnet" as const,
    asset: "0.0.0",
    amount: "1000000000",
    payTo: SOYEB_HEDERA,
    maxTimeoutSeconds: 180,
    extra: { feePayer: "0.0.9185802" },
  };
  const payment: PaymentPayload = { x402Version: 2, accepted, payload: { transaction: "AAAA" } };

  it("verifies, settles and marks the deal paid with the transaction id", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([deal])
      .mockResolvedValueOnce([{ version: 7 }]);
    facilitator.verify.mockResolvedValue({ isValid: true, payer: "0.0.5001" });
    facilitator.settle.mockResolvedValue({
      success: true,
      transaction: "0.0.9185802@1755500000.000000000",
      network: "hedera:testnet",
      payer: "0.0.5001",
    });
    const result = await settleDeal(BARGAIN, deal.stall_id, "buyer", payment);
    expect(result).toMatchObject({
      ok: true,
      transaction: "0.0.9185802@1755500000.000000000",
      payer: "0.0.5001",
    });
    const update = vi.mocked(query).mock.calls[1]!;
    expect(update[0]).toMatch(/SET status = 'paid', paid_tx = \$4/);
    expect(orderPaid).toHaveBeenCalledWith(
      BARGAIN,
      deal.stall_id,
      "0.0.9185802@1755500000.000000000",
    );
    expect(update[1]).toEqual([
      BARGAIN,
      deal.stall_id,
      "buyer",
      "0.0.9185802@1755500000.000000000",
      "1000000000",
      "0.0.0",
      "0.0.5001",
    ]);
  });

  it("refuses a payment signed for a different amount, without asking the facilitator", async () => {
    vi.mocked(query).mockResolvedValueOnce([deal]);
    const cheap: PaymentPayload = { ...payment, accepted: { ...accepted, amount: "1" } };
    await expect(settleDeal(BARGAIN, deal.stall_id, "buyer", cheap)).resolves.toMatchObject({
      ok: false,
      status: 402,
    });
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it("leaves the deal unpaid when the facilitator rejects it", async () => {
    vi.mocked(query).mockResolvedValueOnce([deal]);
    facilitator.verify.mockResolvedValue({
      isValid: false,
      invalidReason: "invalid_exact_hedera_payload_preflight_failed",
    });
    await expect(settleDeal(BARGAIN, deal.stall_id, "buyer", payment)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_exact_hedera_payload_preflight_failed",
    });
    expect(facilitator.settle).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
