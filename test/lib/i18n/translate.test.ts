import { describe, expect, it } from "vitest";
import { CATALOG, type Msg } from "@/lib/i18n/catalog";
import { translate } from "@/lib/i18n/translate";

describe("translate", () => {
  it("returns English when lang is en", () => {
    expect(translate("en", "Open")).toBe("Open");
  });

  it("looks up a catalog phrase", () => {
    expect(translate("hi", "Open")).toBe(CATALOG.Open.hi);
  });

  it("fills placeholders", () => {
    expect(translate("en", "Back in {n} min", { n: 5 })).toBe("Back in 5 min");
    expect(translate("hi", "Payouts to {upi}", { upi: "ramu@okaxis" })).toBe(
      CATALOG["Payouts to {upi}"].hi.replace("{upi}", "ramu@okaxis"),
    );
  });

  it("every catalog entry covers all non-English langs", () => {
    const langs = ["hi", "mr", "ta", "ne", "ja", "ko", "zh", "es", "fr"] as const;
    for (const msg of Object.keys(CATALOG) as Msg[]) {
      for (const lang of langs) {
        expect(CATALOG[msg][lang], `${msg} / ${lang}`).toEqual(expect.any(String));
      }
    }
  });
});

describe("translateText", () => {
  it("translates a known phrase, or a phrase with values", async () => {
    const { translateText } = await import("@/lib/i18n/translate");
    expect(translateText("hi", "Open")).toBe(CATALOG.Open.hi);
    expect(translateText("fr", { msg: "Back in {n} min", vars: { n: 3 } })).toBe(
      CATALOG["Back in {n} min"].fr.replace("{n}", "3"),
    );
  });

  it("shows words it doesn't know as they are", async () => {
    const { translateText } = await import("@/lib/i18n/translate");
    expect(translateText("hi", "Masala Chai is already on your menu.")).toBe(
      "Masala Chai is already on your menu.",
    );
    expect(translateText("ja", "")).toBe("");
  });
});
