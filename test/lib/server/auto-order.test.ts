import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/server/limits", () => ({ getLimits: vi.fn(), payingBreaks: vi.fn() }));

import { query } from "@/lib/server/db";
import { payingBreaks } from "@/lib/server/limits";
import { claimPay, orderPaid, payFailed } from "@/lib/server/auto-order";

const ID = "11111111-2222-3333-4444-555555555555";
const due = { at: Date.now(), stallId: "u-f8095aba", stall: "MOHD SOYEB KHAN", total: 190 };

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(payingBreaks).mockReset().mockResolvedValue(null);
});

describe("claimPay", () => {
  it("claims the due payment once and hands back the deal to pay", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([{ auto: due }])
      .mockResolvedValueOnce([{ status: "agreed", current: 190, paid: false }]);
    await expect(claimPay("buyer", ID)).resolves.toEqual({ stallId: due.stallId, total: 190 });
    const [claim] = vi.mocked(query).mock.calls[0]!;
    expect(claim).toMatch(/'\{"paying": true\}'/);
    expect(claim).toMatch(
      /NOT jsonb_exists_any\(auto, ARRAY\['stopped', 'done', 'error', 'paying'\]\)/,
    );
  });

  it("is null when another tab claimed it, or it was stopped", async () => {
    vi.mocked(query).mockResolvedValueOnce([]);
    await expect(claimPay("buyer", ID)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("won't pay a deal whose price moved or that breaks a limit", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([{ auto: due }])
      .mockResolvedValueOnce([{ status: "agreed", current: 250, paid: false }])
      .mockResolvedValueOnce([]);
    await expect(claimPay("buyer", ID)).resolves.toBeNull();
    expect(vi.mocked(query).mock.calls[2]![0]).toMatch(/'\{"error": true\}'/);

    vi.mocked(query)
      .mockResolvedValueOnce([{ auto: due }])
      .mockResolvedValueOnce([{ status: "agreed", current: 190, paid: false }])
      .mockResolvedValueOnce([]);
    vi.mocked(payingBreaks).mockResolvedValueOnce({ kind: "day", limit: 100 });
    await expect(claimPay("buyer", ID)).resolves.toBeNull();
  });
});

it("records a failed wallet payment so the buyer can pay by hand", async () => {
  vi.mocked(query).mockResolvedValueOnce([]);
  await payFailed("buyer", ID, "The payment didn't go through.", "0.0.11333231");
  expect(JSON.parse(vi.mocked(query).mock.calls[0]![1]![2] as string)).toEqual({
    error: true,
    payError: "The payment didn't go through.",
    payAccount: "0.0.11333231",
  });
});

it("marks the order paid with the Hedera transaction", async () => {
  vi.mocked(query).mockResolvedValueOnce([]);
  await orderPaid(ID, due.stallId, "0.0.9185802@1793989299.723070892");
  const [sql, args] = vi.mocked(query).mock.calls[0]!;
  expect(sql).toMatch(/auto->>'stallId' = \$2/);
  expect(JSON.parse(args![2] as string)).toEqual({
    done: true,
    paid: true,
    settleTx: "0.0.9185802@1793989299.723070892",
    x402: true,
  });
});
