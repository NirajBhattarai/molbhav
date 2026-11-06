import { describe, expect, it } from "vitest";
import { isDiscoveryMode } from "@/lib/discovery-mode";

describe("discovery-mode", () => {
  it("accepts only location and nearby", () => {
    expect(isDiscoveryMode("nearby")).toBe(true);
    expect(isDiscoveryMode("location")).toBe(true);
    expect(isDiscoveryMode("gps")).toBe(false);
    expect(isDiscoveryMode("")).toBe(false);
    expect(isDiscoveryMode(null)).toBe(false);
  });
});
