import { describe, expect, it } from "vitest";
import { labelWant, parseHeard, parseWantLocal, priceIn, words } from "@/lib/want";

describe("parseWantLocal", () => {
  it("splits '2 samosa and 2 chai' into two qty lines", () => {
    expect(parseWantLocal("2 samosa and 2 chai")).toEqual([
      { name: "samosa", qty: 2 },
      { name: "chai", qty: 2 },
    ]);
  });

  it("strips 'I need' fluff before parsing", () => {
    expect(parseWantLocal("I need 2 samosa and 2 chai")).toEqual([
      { name: "samosa", qty: 2 },
      { name: "chai", qty: 2 },
    ]);
  });

  it("reads word quantities", () => {
    expect(parseWantLocal("two chai and three samosas")).toEqual([
      { name: "chai", qty: 2 },
      { name: "samosa", qty: 3 },
    ]);
  });

  it("reads Hindi qty words", () => {
    expect(parseWantLocal("do chai and teen samosa")).toEqual([
      { name: "chai", qty: 2 },
      { name: "samosa", qty: 3 },
    ]);
  });

  it("splits 'do chai or samosa' (speech list)", () => {
    expect(parseWantLocal("do chai or samosa")).toEqual([
      { name: "chai", qty: 2 },
      { name: "samosa", qty: 1 },
    ]);
  });

  it("keeps bare second item after a qty line", () => {
    expect(parseWantLocal("do chai and samosa")).toEqual([
      { name: "chai", qty: 2 },
      { name: "samosa", qty: 1 },
    ]);
  });

  it("reads 'pani puri for 4'", () => {
    expect(parseWantLocal("Pani puri for 4")).toEqual([{ name: "pani puri", qty: 4 }]);
  });

  it("reads trailing qty", () => {
    expect(parseWantLocal("samosa 2 and chai 2")).toEqual([
      { name: "samosa", qty: 2 },
      { name: "chai", qty: 2 },
    ]);
  });

  it("defaults bare items to qty 1", () => {
    expect(parseWantLocal("Tomatoes & onions")).toEqual([
      { name: "tomatoe", qty: 1 },
      { name: "onion", qty: 1 },
    ]);
  });
});

describe("labelWant", () => {
  it("shows qty with × when more than one", () => {
    expect(labelWant({ name: "chai", qty: 2 })).toBe("2× Chai");
    expect(labelWant({ name: "samosa", qty: 1 })).toBe("Samosa");
  });
});

describe("priceIn", () => {
  it("finds under ₹ budgets", () => {
    expect(priceIn("2 chai under ₹100")).toBe(100);
    expect(priceIn("budget 2k")).toBe(2000);
  });
});

describe("words", () => {
  it("drops stop words and stems", () => {
    expect([...words("I need two samosas please")]).toEqual(["samosa"]);
  });
});

describe("parseHeard", () => {
  const ok = {
    items: ["2× Chai"],
    budget: 50,
    english: "2 chai",
    stalls: [{ id: "u-1", name: "Ramesh", item: "Chai" }],
  };

  it("reads back what the sheet understood", () => {
    expect(parseHeard(JSON.stringify(ok))).toEqual(ok);
    expect(parseHeard(JSON.stringify({ ...ok, budget: null, stalls: [] }))?.budget).toBeNull();
  });

  it("rejects anything off, so the server reads the order itself", () => {
    expect(parseHeard(null)).toBeNull();
    expect(parseHeard("not json")).toBeNull();
    expect(parseHeard(JSON.stringify({ ...ok, budget: -5 }))).toBeNull();
    expect(parseHeard(JSON.stringify({ ...ok, budget: 1.5 }))).toBeNull();
    expect(parseHeard(JSON.stringify({ ...ok, stalls: [{ id: "u-1" }] }))).toBeNull();
    expect(parseHeard(JSON.stringify({ ...ok, items: "chai" }))).toBeNull();
  });
});
