import { describe, expect, it } from "vitest";
import {
  labelWant,
  matchMenu,
  menuMatch,
  parseHeard,
  parseWantLocal,
  priceIn,
  rankStalls,
  words,
  type MenuRow,
} from "@/lib/want";

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
    lines: [{ name: "chai", qty: 2 }],
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

  it("needs the order lines, so the server can pick stalls again", () => {
    expect(parseHeard(JSON.stringify({ ...ok, lines: undefined }))).toBeNull();
    expect(parseHeard(JSON.stringify({ ...ok, lines: [] }))).toBeNull();
    expect(parseHeard(JSON.stringify({ ...ok, lines: [{ name: "chai", qty: 0 }] }))).toBeNull();
    expect(parseHeard(JSON.stringify({ ...ok, lines: [{ name: "chai", qty: 1.5 }] }))).toBeNull();
  });
});

let nextId = 1;
const item = (stallId: string, name: string, extra = ""): MenuRow => ({
  id: nextId++,
  stallId,
  stallName: stallId,
  name,
  words: extra,
  price: 20,
});

describe("menuMatch", () => {
  const tiffin = [item("t", "Masala Dosa", "dosa"), item("t", "Filter Coffee", "coffee")];
  const chai = [item("c", "Cutting Chai", "chai, tea"), item("c", "Masala Chai", "chai, tea")];

  it("never matches on a describing word alone", () => {
    expect(matchMenu(tiffin, "masala chai")).toBeNull();
  });

  it("prefers the item with the whole name over one with the last word", () => {
    expect(menuMatch(chai, "masala chai")).toMatchObject({
      row: { name: "Masala Chai" },
      fit: "full",
    });
  });

  it("falls back to the thing itself when the stall has no exact item", () => {
    expect(menuMatch([chai[0]], "masala chai")).toMatchObject({
      row: { name: "Cutting Chai" },
      fit: "head",
    });
  });

  it("matches another name the stall gave the item", () => {
    expect(matchMenu([item("c", "Irani Chai", "chai, tea")], "tea")?.name).toBe("Irani Chai");
  });
});

describe("rankStalls", () => {
  const pool = [
    item("near-tiffin", "Masala Dosa", "dosa"),
    item("near-cutting", "Cutting Chai", "chai"),
    item("mid-masala", "Masala Chai", "chai"),
    item("far-masala", "Masala Chai", "chai"),
  ];

  it("puts whole-name matches first, then keeps pool order", () => {
    expect(rankStalls([{ name: "masala chai", qty: 2 }], pool).map((s) => s.id)).toEqual([
      "mid-masala",
      "far-masala",
      "near-cutting",
    ]);
  });

  it("keeps only as many stalls as asked", () => {
    expect(rankStalls([{ name: "chai", qty: 1 }], pool, 2).map((s) => s.id)).toEqual([
      "near-cutting",
      "mid-masala",
    ]);
  });

  it("gives each stall one item, from any line of the order", () => {
    const both = rankStalls(
      [
        { name: "samosa", qty: 2 },
        { name: "dosa", qty: 1 },
      ],
      pool,
    );
    expect(both).toEqual([{ id: "near-tiffin", name: "near-tiffin", item: "Masala Dosa" }]);
  });
});
