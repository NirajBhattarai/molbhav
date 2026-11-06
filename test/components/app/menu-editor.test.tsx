// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopItem } from "@/lib/server/shop";

const actions = vi.hoisted(() => ({
  saveItem: vi.fn(),
  removeItem: vi.fn(),
  scanMenu: vi.fn(),
  saveScannedItems: vi.fn(),
}));
vi.mock("@/lib/shop-actions", () => actions);
vi.mock("@/lib/photo", () => ({ shrinkPhoto: vi.fn(async (file: File) => file) }));

const { MenuSection } = await import("@/components/app/menu-editor");

const dish = (id: number, name: string, price: number, lowest = price, aliases: string[] = []) =>
  ({ id, name, price, lowest, aliases }) satisfies ShopItem;

const MENU = [
  dish(1, "Masala chai", 20, 15, ["chai", "tea"]),
  dish(2, "Samosa", 15),
  dish(3, "Vada pav", 25, 20),
];

beforeEach(() => {
  actions.saveItem.mockResolvedValue(null);
  actions.saveScannedItems.mockResolvedValue({ added: 0, updated: 0 });
});

describe("empty menu", () => {
  it("offers scanning when the stall can read menus", () => {
    render(<MenuSection items={[]} canReadMenu />);
    expect(screen.getByRole("heading", { name: "Add your menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan or upload menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add items by hand" })).toBeInTheDocument();
  });

  it("falls back to adding by hand without menu scan", () => {
    render(<MenuSection items={[]} canReadMenu={false} />);
    expect(screen.queryByRole("button", { name: /Scan/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first item" })).toBeInTheDocument();
  });
});

describe("menu list", () => {
  it("shows each dish with its price", () => {
    render(<MenuSection items={MENU} canReadMenu />);
    expect(screen.getByText("3 items")).toBeInTheDocument();
    const chai = screen.getByRole("button", { name: /Masala chai/ });
    expect(chai).toHaveTextContent("₹20");
    expect(chai).toHaveTextContent("Lowest ₹15");
  });

  it("only shows search once the menu is long", () => {
    const { rerender } = render(<MenuSection items={MENU} canReadMenu />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    const long = Array.from({ length: 8 }, (_, i) => dish(10 + i, `Dish ${i}`, 10));
    rerender(<MenuSection items={[...MENU, ...long]} canReadMenu />);
    expect(screen.getByPlaceholderText("Search 11 items")).toBeInTheDocument();
  });

  it("finds a dish by another name buyers use, and offers to add a missing one", async () => {
    const user = userEvent.setup();
    const long = Array.from({ length: 8 }, (_, i) => dish(10 + i, `Dish ${i}`, 10));
    render(<MenuSection items={[...MENU, ...long]} canReadMenu />);
    const search = screen.getByPlaceholderText("Search 11 items");

    await user.type(search, "tea");
    expect(screen.getByRole("button", { name: /Masala chai/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Samosa/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "Lassi");
    expect(screen.getByText(/Nothing on your menu matches/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add “Lassi”" }));
    expect(await screen.findByRole("dialog", { name: "Add item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Item name")).toHaveValue("Lassi");
  });
});

describe("item form", () => {
  it("adds a new item, with the lowest price defaulting to 80% of the ask", async () => {
    const user = userEvent.setup();
    render(<MenuSection items={MENU} canReadMenu />);
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const sheet = screen.getByRole("dialog", { name: "Add item" });
    await user.type(within(sheet).getByLabelText("Item name"), "Lassi");
    await user.type(within(sheet).getByLabelText("You ask"), "50");
    await user.click(screen.getByRole("button", { name: "Add to menu" }));
    expect(actions.saveItem).toHaveBeenCalledWith({
      id: null,
      name: "Lassi",
      price: 50,
      lowest: 40,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("warns about a dish already on the menu and won't add it twice", async () => {
    const user = userEvent.setup();
    render(<MenuSection items={MENU} canReadMenu />);
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Item name"), "masala CHAI");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Masala chai is already on your menu at ₹20.",
    );
    expect(screen.getByRole("button", { name: "Add to menu" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Edit it/ }));
    expect(await screen.findByRole("dialog", { name: "Edit item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Item name")).toHaveValue("Masala chai");
    expect(actions.saveItem).not.toHaveBeenCalled();
  });

  it("refuses a lowest price above the ask", async () => {
    const user = userEvent.setup();
    render(<MenuSection items={MENU} canReadMenu />);
    await user.click(screen.getByRole("button", { name: /Samosa/ }));
    const lowest = screen.getByLabelText("Lowest you’ll take");
    await user.clear(lowest);
    await user.type(lowest, "99");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      screen.getByText("The lowest price can’t be above the price you ask."),
    ).toBeInTheDocument();
    expect(actions.saveItem).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<MenuSection items={MENU} canReadMenu />);
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("menu scan review", () => {
  async function scan(items: { name: string; words: string; scanned: number }[]) {
    actions.scanMenu.mockResolvedValue({ items });
    const user = userEvent.setup();
    const { container } = render(<MenuSection items={MENU} canReadMenu />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["menu"], "menu.png", { type: "image/png" }));
    await screen.findByRole("dialog", { name: "Check your menu" });
    return user;
  }

  it("shows what is new, what will update, and what is unchanged", async () => {
    await scan([
      { name: "MASALA CHAI", words: "", scanned: 22 },
      { name: "Samosa", words: "", scanned: 15 },
      { name: "Lassi", words: "dahi", scanned: 40 },
    ]);
    const summary = screen.getByRole("region", { name: "What will change" });
    expect(summary).toHaveTextContent(/1\s*New/);
    expect(summary).toHaveTextContent(/1\s*Will update/);
    expect(summary).toHaveTextContent(/1\s*No change/);
    expect(screen.getByRole("button", { name: "Add 1 · Update 1" })).toBeInTheDocument();
  });

  it("saves only the rows that change, keeping the shopkeeper's spelling", async () => {
    const user = await scan([
      { name: "MASALA CHAI", words: "", scanned: 22 },
      { name: "Samosa", words: "", scanned: 15 },
      { name: "Lassi", words: "dahi", scanned: 40 },
    ]);
    actions.saveScannedItems.mockResolvedValue({ added: 1, updated: 1 });
    await user.click(screen.getByRole("button", { name: "Add 1 · Update 1" }));
    expect(actions.saveScannedItems).toHaveBeenCalledWith([
      { name: "Masala chai", words: "", price: 22, lowest: 22 },
      { name: "Lassi", words: "dahi", price: 40, lowest: 40 },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("has nothing to save when the photo matches the menu", async () => {
    await scan([{ name: "Samosa", words: "", scanned: 15 }]);
    expect(screen.getByRole("button", { name: "Nothing to change" })).toBeDisabled();
  });

  it("shows the scan error instead of the review", async () => {
    actions.scanMenu.mockResolvedValue({ error: "No prices found in that photo." });
    const user = userEvent.setup();
    const { container } = render(<MenuSection items={MENU} canReadMenu />);
    await user.upload(
      container.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(["x"], "x.png", { type: "image/png" }),
    );
    expect(await screen.findByText("No prices found in that photo.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
