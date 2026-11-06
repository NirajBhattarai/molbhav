import { describe, expect, it } from "vitest";
import { menuKey } from "@/lib/menu";

describe("menuKey", () => {
  it.each([
    ["Masala Chai", "masala chai"],
    ["  Vada   Pav ", "vada pav"],
    ["Masala-chai.", "Masala chai"],
    ["Café Latte", "cafe latte"],
    ["पानी पूरी", "पानी  पूरी!"],
    ["மசாலா டீ", "மசாலா-டீ"],
  ])("treats %j and %j as the same dish", (a, b) => {
    expect(menuKey(a)).toBe(menuKey(b));
  });

  it.each([
    ["Samosa (2 pcs)", "Samosa"],
    ["Chai", "Tea"],
    ["पानी", "पिन"],
    ["पानी", "पन"],
  ])("keeps %j and %j apart", (a, b) => {
    expect(menuKey(a)).not.toBe(menuKey(b));
  });

  it("is empty for names with no letters or digits", () => {
    expect(menuKey(" -- ")).toBe("");
  });
});
