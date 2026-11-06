import { describe, expect, it } from "vitest";
import { canVisit, parseRole, redirectFor } from "@/lib/access";

describe("parseRole", () => {
  it("accepts known roles only", () => {
    expect(parseRole("buyer")).toBe("buyer");
    expect(parseRole("shopkeeper")).toBe("shopkeeper");
    expect(parseRole("admin")).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });
});

describe("canVisit", () => {
  it("keeps each role to its own screens, plus Profile", () => {
    expect(canVisit("buyer", "/")).toBe(true);
    expect(canVisit("buyer", "/shop")).toBe(false);
    expect(canVisit("shopkeeper", "/shop")).toBe(true);
    expect(canVisit("shopkeeper", "/shop/items")).toBe(true);
    expect(canVisit("shopkeeper", "/")).toBe(false);
    expect(canVisit("buyer", "/profile")).toBe(true);
    expect(canVisit("shopkeeper", "/profile")).toBe(true);
  });

  it("doesn't treat look-alike paths as inside an area", () => {
    expect(canVisit("shopkeeper", "/shopping")).toBe(false);
  });
});

describe("redirectFor", () => {
  it.each([
    // [path, signedIn, role, expected]
    ["/", false, null, "/sign-in"],
    ["/shop", false, "shopkeeper", "/sign-in"],
    ["/sign-in", false, null, null],
    ["/", true, null, "/role"],
    ["/role", true, null, null],
    ["/sign-in", true, "buyer", "/"],
    ["/sign-in", true, "shopkeeper", "/shop"],
    ["/role", true, "buyer", null],
    ["/", true, "buyer", null],
    ["/shop", true, "buyer", "/"],
    ["/", true, "shopkeeper", "/shop"],
    ["/profile", true, "shopkeeper", null],
  ] as const)("%s (signed in: %s, role: %s) → %s", (path, signedIn, role, expected) => {
    expect(redirectFor(path, signedIn, role)).toBe(expected);
  });
});
