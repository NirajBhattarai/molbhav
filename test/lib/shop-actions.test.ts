import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  menu: [] as { id: number; name: string }[],
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({ query: db.query, transaction: db.transaction }));
vi.mock("@/lib/server/shop", () => ({
  me: vi.fn(async () => ({ id: "did:ramu", email: "ramu@example.com" })),
  ensureUser: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/gemini", () => ({
  aliasesFor: vi.fn(async () => ["chai", "tea"]),
  geminiConfigured: vi.fn(() => false),
  geminiJSON: vi.fn(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { pinLocation, saveItem, saveScannedItems, scanMenu } = await import("@/lib/shop-actions");

/** Fake Postgres: the stall row is "s1"; SELECTs on stall_items return `db.menu`. */
beforeEach(() => {
  db.menu = [];
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO stalls") && sql.includes("RETURNING id")) return [{ id: "s1" }];
    if (sql.startsWith("SELECT id, name FROM stall_items")) return db.menu;
    return [];
  });
  db.transaction.mockResolvedValue([]);
});

const writes = () =>
  db.query.mock.calls.filter(([sql]) => /^\s*(INSERT INTO|UPDATE) stall_items/.test(sql));

describe("saveItem", () => {
  const item = { id: null, name: "Masala chai", price: 20, lowest: 15 };

  it.each([
    [{ name: "  " }, "Give the item a name."],
    [{ price: 0 }, "Enter a starting price in rupees."],
    [{ price: 20_000_000 }, "Enter a starting price in rupees."],
    [{ lowest: 0 }, "Enter the lowest price you’d accept."],
    [{ lowest: 25 }, "The lowest price can’t be above your starting price."],
  ])("refuses %j", async (change, error) => {
    expect(await saveItem({ ...item, ...change })).toEqual({ error });
    expect(writes()).toHaveLength(0);
  });

  it("adds a new item with its aliases", async () => {
    expect(await saveItem(item)).toBeNull();
    expect(writes()).toEqual([
      [
        expect.stringContaining("INSERT INTO stall_items"),
        ["s1", "Masala chai", "chai tea", 20, 15],
      ],
    ]);
  });

  it("refuses a second copy of a dish already on the menu", async () => {
    db.menu = [{ id: 7, name: "Masala Chai" }];
    expect(await saveItem({ ...item, name: "masala-chai." })).toEqual({
      error: "Masala Chai is already on your menu.",
      duplicateOf: 7,
    });
    expect(writes()).toHaveLength(0);
  });

  it("lets an item keep its own name when edited", async () => {
    db.menu = [{ id: 7, name: "Masala Chai" }];
    expect(await saveItem({ ...item, id: 7, price: 25 })).toBeNull();
    expect(writes()).toEqual([
      [expect.stringContaining("UPDATE stall_items"), ["s1", 7, "Masala chai", "chai tea", 25, 15]],
    ]);
  });
});

describe("saveScannedItems", () => {
  const row = (name: string, price = 20, lowest = 15, words = "") => ({
    name,
    words,
    price,
    lowest,
  });
  const saved = () => db.transaction.mock.calls[0][0] as { text: string; params: unknown[] }[];

  it("refuses an empty or oversized batch", async () => {
    expect(await saveScannedItems([])).toEqual({ error: "No items to save." });
    const many = Array.from({ length: 61 }, (_, i) => row(`Item ${i}`));
    expect(await saveScannedItems(many)).toEqual({
      error: "That’s too many items at once. Save up to 60.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses a batch with no valid rows", async () => {
    expect(await saveScannedItems([row(""), row("Tea", 10, 20)])).toEqual({
      error: "Check each item’s name, ask, and floor.",
    });
  });

  it("updates dishes already on the menu and adds the rest", async () => {
    db.menu = [{ id: 3, name: "Samosa" }];
    expect(await saveScannedItems([row("SAMOSA", 18, 15), row("Vada pav", 25, 20)])).toEqual({
      added: 1,
      updated: 1,
    });
    const [update, insert] = saved();
    expect(update.text).toMatch(/^UPDATE stall_items/);
    expect(update.params).toEqual(["s1", 3, "SAMOSA", "", 18, 15]);
    expect(insert.text).toMatch(/^INSERT INTO stall_items/);
    expect(insert.params).toEqual(["s1", "Vada pav", "", 25, 20]);
  });

  it("keeps only the last of repeated rows in one scan", async () => {
    expect(await saveScannedItems([row("Chai", 10, 8), row("chai!", 12, 10)])).toEqual({
      added: 1,
      updated: 0,
    });
    expect(saved()).toHaveLength(1);
    expect(saved()[0].params).toEqual(["s1", "chai!", "", 12, 10]);
  });

  it("cleans alias words to lowercase letters", async () => {
    await saveScannedItems([row("Chai", 10, 8, "Cha-i  TEA 2")]);
    expect(saved()[0].params[2]).toBe("cha i tea");
  });
});

describe("pinLocation", () => {
  it.each([
    [0, 0],
    [91, 10],
    [10, 181],
    [Number.NaN, 10],
  ])("refuses %s, %s", async (lat, lng) => {
    expect(await pinLocation(lat, lng)).toEqual({ error: "Couldn’t share location." });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("saves a real position", async () => {
    expect(await pinLocation(19.07, 72.87)).toBeNull();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("lat = EXCLUDED.lat"), [
      "did:ramu",
      expect.stringMatching(/^u-/),
      19.07,
      72.87,
    ]);
  });
});

describe("scanMenu", () => {
  it("explains when menu scan isn't configured", async () => {
    expect(await scanMenu(new FormData())).toEqual({
      error: expect.stringContaining("GEMINI_API_KEY"),
    });
  });
});
