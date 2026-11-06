import { describe, expect, it } from "vitest";
import { LANG, LANGS, isLang, langOf } from "@/lib/languages";

describe("languages", () => {
  it("has a label and locale for every supported language", () => {
    for (const code of LANGS) {
      expect(LANG[code].own).toBeTruthy();
      expect(LANG[code].locale).toMatch(new RegExp(`^${code}-`));
    }
  });

  it("isLang only accepts supported codes", () => {
    expect(isLang("hi")).toBe(true);
    expect(isLang("de")).toBe(false);
    expect(isLang(42)).toBe(false);
  });

  it("langOf picks a supported language from a phone locale", () => {
    expect(langOf("ja-JP", "en")).toBe("ja");
    expect(langOf("HI-in", "en")).toBe("hi");
    expect(langOf("de-DE", "en")).toBe("en");
    expect(langOf(undefined, "ne")).toBe("ne");
  });
});
