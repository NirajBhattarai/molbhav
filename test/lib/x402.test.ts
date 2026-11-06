import { describe, expect, it } from "vitest";
import {
  HBAR,
  HEDERA_TESTNET,
  dealRequirements,
  formatHbar,
  hashscanTxUrl,
  sameRequirements,
  tinybars,
} from "@/lib/x402";

describe("tinybars", () => {
  it("prices rupees in tinybars, rounding up for the stall", () => {
    expect(tinybars(15, 15)).toBe(BigInt(100_000_000)); // ₹15 = 1 HBAR
    expect(tinybars(150, 15)).toBe(BigInt(1_000_000_000)); // ₹150 = 10 HBAR
    expect(tinybars(1, 15)).toBe(BigInt(6_666_667)); // 0.0666666… → up
    expect(tinybars(176, 15)).toBe(BigInt(1_173_333_334)); // 11.7333333… → up
  });

  it("refuses zero, negative and missing prices", () => {
    expect(() => tinybars(0)).toThrow();
    expect(() => tinybars(-5)).toThrow();
    expect(() => tinybars(10, 0)).toThrow();
  });
});

describe("formatHbar", () => {
  it("shows at least two decimals and no trailing zeros beyond them", () => {
    expect(formatHbar(BigInt(1_000_000_000))).toBe("10.00");
    expect(formatHbar("1173333334")).toBe("11.73333334");
    expect(formatHbar(BigInt(6_666_667))).toBe("0.06666667");
  });
});

describe("dealRequirements", () => {
  const base = {
    network: HEDERA_TESTNET,
    rupees: 150,
    inrPerHbar: 15,
    payTo: "0.0.11328762",
    feePayer: "0.0.9185802",
  } as const;

  it("asks for exact HBAR to the stall, with fees on the facilitator", () => {
    expect(dealRequirements(base)).toEqual({
      scheme: "exact",
      network: "hedera:testnet",
      asset: HBAR,
      amount: "1000000000",
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
    rupees: 150,
    inrPerHbar: 15,
    payTo: "0.0.11328762",
    feePayer: "0.0.9185802",
  });

  it("accepts the buyer's copy of what we asked", () => {
    expect(sameRequirements(structuredClone(want), want)).toBe(true);
  });

  it("rejects a lower amount, another payee, asset or fee payer", () => {
    expect(sameRequirements({ ...want, amount: "1" }, want)).toBe(false);
    expect(sameRequirements({ ...want, payTo: "0.0.1" }, want)).toBe(false);
    expect(sameRequirements({ ...want, asset: "0.0.429274" }, want)).toBe(false);
    expect(sameRequirements({ ...want, extra: { feePayer: "0.0.2" } }, want)).toBe(false);
    expect(sameRequirements(null, want)).toBe(false);
  });
});

it("links a transaction on HashScan", () => {
  expect(hashscanTxUrl("0.0.9185802@1755500000.000000000")).toBe(
    "https://hashscan.io/testnet/transaction/0.0.9185802%401755500000.000000000",
  );
});
