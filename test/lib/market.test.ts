import { describe, expect, it } from "vitest";
import { against, areaPriceFrom, basketBand, itemKey, quantile, spread } from "@/lib/market";
import type { MenuRow } from "@/lib/want";

let id = 0;
const row = (stallId: string, name: string, price: number, words = ""): MenuRow => ({
  id: ++id,
  stallId,
  stallName: stallId,
  name,
  words,
  price,
});

describe("quantile", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10, 20, 30], 0.5)).toBe(20);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([7], 0.75)).toBe(7);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe("spread", () => {
  it("gives whole-rupee median and quartiles, ignoring junk", () => {
    expect(spread([25, 15, 20, 0, NaN, 30])).toEqual({
      medianInr: 23,
      lowInr: 19,
      highInr: 26,
      samples: 4,
    });
    expect(spread([])).toBeNull();
  });
});

describe("itemKey", () => {
  it("ignores word order and case", () => {
    expect(itemKey("Masala Chai")).toBe(itemKey("chai masala"));
    expect(itemKey("  ")).toBe("");
  });
});

describe("areaPriceFrom", () => {
  const menus = [
    row("a", "Masala Chai", 20, "chai, tea"),
    row("a", "Cutting Chai", 10, "chai, tea"),
    row("b", "Masala Chai", 25, "chai, tea"),
    row("c", "Masala Chai", 30, "chai, tea"),
    row("d", "Tea Powder 250g", 140, "tea leaves, patti"),
  ];

  it("uses one price per stall from nearby menus", () => {
    expect(areaPriceFrom("masala chai", menus, [], 1000)).toEqual({
      item: "masala chai",
      medianInr: 25,
      lowInr: 23,
      highInr: 28,
      samples: 3,
      source: "menus",
      radiusM: 1000,
    });
  });

  it("only counts whole-name matches, one per stall", () => {
    // Stall a's two chais count once; tea powder lists "tea" among its words, so it counts too.
    expect(areaPriceFrom("tea", menus, [], 1000)?.samples).toBe(4);
    expect(areaPriceFrom("ginger tea", menus, [], 1000)).toBeNull();
  });

  it("needs a few stalls before calling anything usual", () => {
    expect(areaPriceFrom("masala chai", menus.slice(0, 3), [], 1000)).toBeNull();
  });

  it("prefers what buyers paid once there are enough deals", () => {
    const deals = [18, 19, 20, 21, 22].map((p) => row("a", "Masala Chai", p, "chai"));
    const r = areaPriceFrom("masala chai", menus, deals, 3000);
    expect(r).toMatchObject({ source: "deals", medianInr: 20, samples: 5, radiusM: 3000 });
    // Too few deals: back to menus.
    expect(areaPriceFrom("masala chai", menus, deals.slice(0, 4), 1000)?.source).toBe("menus");
  });
});

describe("basketBand", () => {
  const chai = { item: "chai", medianInr: 20, lowInr: 18, highInr: 25, samples: 9 };
  const bun = { item: "bun", medianInr: 30, lowInr: 28, highInr: 35, samples: 4 };

  it("adds up lines times quantity", () => {
    expect(
      basketBand([
        { qty: 2, price: { ...chai, source: "deals", radiusM: 1000 } },
        { qty: 1, price: { ...bun, source: "menus", radiusM: 3000 } },
      ]),
    ).toEqual({ medianInr: 70, lowInr: 64, highInr: 85, samples: 4, source: "menus" });
  });

  it("gives nothing when a line has no area price", () => {
    expect(
      basketBand([
        { qty: 1, price: { ...chai, source: "menus", radiusM: 1000 } },
        { qty: 1, price: null },
      ]),
    ).toBeNull();
    expect(basketBand([])).toBeNull();
  });
});

describe("against", () => {
  it("places a price against the band", () => {
    const band = { lowInr: 18, highInr: 25 };
    expect(against(15, band)).toMatch(/below/);
    expect(against(18, band)).toMatch(/within/);
    expect(against(25, band)).toMatch(/within/);
    expect(against(26, band)).toMatch(/above/);
  });
});
