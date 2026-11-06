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
