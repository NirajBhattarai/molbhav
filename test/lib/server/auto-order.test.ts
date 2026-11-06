import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/server/limits", () => ({ getLimits: vi.fn(), payingBreaks: vi.fn() }));

import { query } from "@/lib/server/db";
import { getLimits, payingBreaks } from "@/lib/server/limits";
import { autoOrderStep, claimPay, orderPaid, payFailed } from "@/lib/server/auto-order";

const ID = "11111111-2222-3333-4444-555555555555";
const due = { at: Date.now(), stallId: "u-f8095aba", stall: "MOHD SOYEB KHAN", total: 190 };

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(payingBreaks).mockReset().mockResolvedValue(null);
  vi.mocked(getLimits).mockResolvedValue({
    perOrder: 1000,
    perDay: 1000,
    autoAgree: true,
    autoOrder: true,
  });
});

describe("autoOrderStep", () => {
  const undecided = [{ auto_order: true, auto: null, settled: false }];
  const stall = { stall_id: "u-f8095aba", name: "MOHD SOYEB KHAN" };

  it("doesn't decide 'no deal' while a stall is still haggling", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(undecided)
      .mockResolvedValueOnce([{ ...stall, status: "haggling", current: null }]);
    await expect(autoOrderStep("buyer", ID, true)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(2); // read the state and the offers; wrote nothing
  });

  it("counts down to pay the cheapest agreed deal once there is one", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(undecided)
      .mockResolvedValueOnce([{ ...stall, status: "agreed", current: 190 }])
      .mockResolvedValueOnce([{ id: ID }]);
    await expect(autoOrderStep("buyer", ID, true)).resolves.toBe(true);
    const planned = JSON.parse(vi.mocked(query).mock.calls[2]![1]![1] as string);
    expect(planned).toMatchObject({ stallId: stall.stall_id, total: 190 });
    expect(planned.at).toBeGreaterThan(Date.now());
  });

  it("waits for the talk to end unless told it has", async () => {
    vi.mocked(query).mockResolvedValueOnce(undecided);
    await expect(autoOrderStep("buyer", ID)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
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
