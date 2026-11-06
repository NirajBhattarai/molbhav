import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/server/redis", () => ({ redisConfigured: () => false, redis: vi.fn() }));
vi.mock("@/lib/server/chat-cache", () => ({ wroteChat: vi.fn() }));
vi.mock("@/lib/server/a2a/client", () => ({ appBase: () => "https://molbhav.test" }));
vi.mock("@/lib/server/ens", () => ({ hederaAddressFromEns: vi.fn() }));

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
import type { PaymentPayload } from "@x402/core/types";
import { quoteDeal, settleDeal, stallPayTo } from "@/lib/server/x402";

const BARGAIN = "11111111-2222-3333-4444-555555555555";
const SOYEB_EVM = "0x2E8d9978D48f18eb34AD0D6c5c9E2B2B5c006516";
const deal = {
  stall_id: "u-6c5846d7",
  stall_name: "MOHD SOYEB KHAN",
  owner_id: `did:ethr:${SOYEB_EVM}`,
  ens_label: "mohd-soyeb-khan",
  ens_status: "live",
  item: "Veg Biryani",
  current: 176,
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
  vi.mocked(hederaAddressFromEns).mockResolvedValue(SOYEB_EVM);
  delete process.env.X402_INR_PER_USD;
});

describe("stallPayTo", () => {
  it("pays the Hedera account the stall's ENS name points to", async () => {
    mirror("0.0.11328762");
    await expect(stallPayTo(deal)).resolves.toEqual({ account: "0.0.11328762", via: "ens" });
  });

  it("falls back to the owner's wallet without a live ENS name", async () => {
    mirror("0.0.11328762");
    await expect(stallPayTo({ ...deal, ens_status: null })).resolves.toEqual({
      account: "0.0.11328762",
      via: "wallet",
    });
    expect(hederaAddressFromEns).not.toHaveBeenCalled();
  });
});

describe("quoteDeal", () => {
  it("asks for the agreed price in USDC, to the stall, fees on the facilitator", async () => {
    vi.mocked(query).mockResolvedValueOnce([deal]);
    mirror("0.0.11328762");
    const quote = await quoteDeal(BARGAIN, deal.stall_id, "buyer");
    expect(quote.ok && quote.required).toMatchObject({
      x402Version: 2,
      resource: { url: `https://molbhav.test/api/bargains/${BARGAIN}/u-6c5846d7/pay` },
      accepts: [
        {
          scheme: "exact",
          network: "hedera:testnet",
          asset: "0.0.429274",
          amount: "2000000", // ₹176 at ₹88/$ = $2.00
          payTo: "0.0.11328762",
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

describe("settleDeal", () => {
  const accepted = {
    scheme: "exact",
    network: "hedera:testnet" as const,
    asset: "0.0.429274",
    amount: "2000000",
    payTo: "0.0.11328762",
    maxTimeoutSeconds: 180,
    extra: { feePayer: "0.0.9185802" },
  };
  const payment: PaymentPayload = { x402Version: 2, accepted, payload: { transaction: "AAAA" } };

  it("verifies, settles and marks the deal paid with the transaction id", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([deal])
      .mockResolvedValueOnce([{ version: 7 }]);
    mirror("0.0.11328762");
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
    expect(update[1]).toEqual([
      BARGAIN,
      deal.stall_id,
      "buyer",
      "0.0.9185802@1755500000.000000000",
      "2000000",
      "0.0.429274",
      "0.0.5001",
    ]);
  });

  it("refuses a payment signed for a different amount, without asking the facilitator", async () => {
    vi.mocked(query).mockResolvedValueOnce([deal]);
    mirror("0.0.11328762");
    const cheap: PaymentPayload = { ...payment, accepted: { ...accepted, amount: "1" } };
    await expect(settleDeal(BARGAIN, deal.stall_id, "buyer", cheap)).resolves.toMatchObject({
      ok: false,
      status: 402,
    });
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it("leaves the deal unpaid when the facilitator rejects it", async () => {
    vi.mocked(query).mockResolvedValueOnce([deal]);
    mirror("0.0.11328762");
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
