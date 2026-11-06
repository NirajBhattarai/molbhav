import { describe, expect, it } from "vitest";
import {
  HEDERA_TESTNET,
  USDC,
  dealRequirements,
  formatUsdc,
  hashscanTxUrl,
  sameRequirements,
  usdcUnits,
} from "@/lib/x402";

describe("usdcUnits", () => {
  it("prices rupees in USDC's smallest unit, rounding up for the stall", () => {
    expect(usdcUnits(88, 88)).toBe(BigInt(1_000_000)); // ₹88 = $1.00
    expect(usdcUnits(220, 88)).toBe(BigInt(2_500_000)); // ₹220 = $2.50
    expect(usdcUnits(1, 88)).toBe(BigInt(11_364)); // 0.011363… → up to 0.011364
    expect(usdcUnits(100, 83.5)).toBe(BigInt(1_197_605)); // 1.1976047… → up
  });

  it("refuses zero, negative and missing prices", () => {
    expect(() => usdcUnits(0)).toThrow();
    expect(() => usdcUnits(-5)).toThrow();
    expect(() => usdcUnits(10, 0)).toThrow();
  });
});

describe("formatUsdc", () => {
  it("shows at least two decimals and no trailing zeros beyond them", () => {
    expect(formatUsdc(BigInt(2_500_000))).toBe("2.50");
    expect(formatUsdc("1000000")).toBe("1.00");
    expect(formatUsdc(BigInt(11_364))).toBe("0.011364");
  });
});

describe("dealRequirements", () => {
  const base = {
    network: HEDERA_TESTNET,
    rupees: 220,
    inrPerUsd: 88,
    payTo: "0.0.11328762",
    feePayer: "0.0.9185802",
  } as const;

  it("asks for exact USDC to the stall, with fees on the facilitator", () => {
    expect(dealRequirements(base)).toEqual({
      scheme: "exact",
      network: "hedera:testnet",
      asset: USDC["hedera:testnet"],
      amount: "2500000",
      payTo: "0.0.11328762",
      maxTimeoutSeconds: 180,
      extra: { feePayer: "0.0.9185802" },
    });
  });

  it("needs Hedera account ids, not EVM addresses", () => {
    expect(() =>
      dealRequirements({ ...base, payTo: "0x2E8d9978D48f18eb34AD0D6c5c9E2B2B5c006516" }),
    ).toThrow();
    expect(() => dealRequirements({ ...base, feePayer: "" })).toThrow();
  });
});

describe("sameRequirements", () => {
  const want = dealRequirements({
    network: HEDERA_TESTNET,
    rupees: 220,
    inrPerUsd: 88,
    payTo: "0.0.11328762",
    feePayer: "0.0.9185802",
  });

  it("accepts the buyer's copy of what we asked", () => {
    expect(sameRequirements(structuredClone(want), want)).toBe(true);
  });

  it("rejects a lower amount, another payee, asset or fee payer", () => {
    expect(sameRequirements({ ...want, amount: "1" }, want)).toBe(false);
    expect(sameRequirements({ ...want, payTo: "0.0.1" }, want)).toBe(false);
    expect(sameRequirements({ ...want, asset: "0.0.0" }, want)).toBe(false);
    expect(sameRequirements({ ...want, extra: { feePayer: "0.0.2" } }, want)).toBe(false);
    expect(sameRequirements(null, want)).toBe(false);
  });
});

it("links a transaction on HashScan", () => {
  expect(hashscanTxUrl("0.0.9185802@1755500000.000000000")).toBe(
    "https://hashscan.io/testnet/transaction/0.0.9185802%401755500000.000000000",
  );
});
