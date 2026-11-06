import { describe, expect, it } from "vitest";
import { isVpa, parseUpi } from "@/lib/upi";

describe("isVpa", () => {
  it.each(["ramu@okaxis", "ramu.chai-01@ybl", " shop_1@paytm "])("accepts %j", (v) => {
    expect(isVpa(v)).toBe(true);
  });

  it.each(["", "ramu", "@okaxis", "ramu@", "ramu@1bank", "ra mu@okaxis"])("rejects %j", (v) => {
    expect(isVpa(v)).toBe(false);
  });
});

describe("parseUpi", () => {
  it("reads a typed UPI ID and lowercases it", () => {
    expect(parseUpi(" Ramu@OkAxis ")).toEqual({ vpa: "ramu@okaxis" });
  });

  it("reads payee and name from a UPI payment QR", () => {
    const qr = "upi://pay?pa=Ramu@okaxis&pn=Ramu%20Chai&cu=INR";
    expect(parseUpi(qr)).toEqual({ vpa: "ramu@okaxis", name: "Ramu Chai", qr });
  });

  it("rejects a QR that isn't a UPI payment link", () => {
    expect(parseUpi("https://example.com/pay")).toHaveProperty("error");
    expect(parseUpi("upi://mandate?pa=ramu@okaxis")).toHaveProperty("error");
  });

  it("rejects a UPI QR with no valid payee", () => {
    expect(parseUpi("upi://pay?pn=Ramu")).toEqual({
      error: expect.stringContaining("no valid UPI ID"),
    });
  });

  it("rejects a QR for another currency", () => {
    expect(parseUpi("upi://pay?pa=ramu@okaxis&cu=USD")).toEqual({
      error: expect.stringContaining("Indian rupees"),
    });
  });

  it("rejects plain text that is neither", () => {
    expect(parseUpi("hello")).toHaveProperty("error");
  });
});
