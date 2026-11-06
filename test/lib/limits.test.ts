import { describe, expect, it } from "vitest";
import { NO_LIMITS, autoPending, brokenLimit, capped, limitsProblem } from "@/lib/limits";

describe("capped", () => {
  it("keeps the agent within one order's limit", () => {
    expect(capped(500, { perOrder: 200 })).toBe(200);
    expect(capped(150, { perOrder: 200 })).toBe(150);
    expect(capped(null, { perOrder: 200 })).toBe(200);
    expect(capped(150, { perOrder: null })).toBe(150);
  });
});

describe("brokenLimit", () => {
  const limits = { perOrder: 200, perDay: 500 };
  it("names the order or the day limit a payment would pass", () => {
    expect(brokenLimit(250, 0, limits)).toEqual({ kind: "order", limit: 200 });
    expect(brokenLimit(190, 400, limits)).toEqual({ kind: "day", limit: 500 });
    expect(brokenLimit(190, 300, limits)).toBeNull();
    expect(brokenLimit(10_000, 10_000, NO_LIMITS)).toBeNull();
  });
});

describe("limitsProblem", () => {
  it("accepts sensible limits", () => {
    expect(limitsProblem({ perOrder: 200, perDay: 500, autoAgree: true, autoOrder: true })).toBe(
      null,
    );
    expect(limitsProblem(NO_LIMITS)).toBeNull();
  });

  it("refuses limits the agent can't follow", () => {
    expect(limitsProblem({ ...NO_LIMITS, perOrder: 0 })).not.toBeNull();
    expect(limitsProblem({ ...NO_LIMITS, perOrder: 600, perDay: 500 })).not.toBeNull();
    expect(limitsProblem({ ...NO_LIMITS, autoOrder: true })).not.toBeNull(); // needs autoAgree
    expect(
      limitsProblem({ perOrder: null, perDay: 500, autoAgree: true, autoOrder: true }),
    ).not.toBeNull(); // paying needs both limits
  });
});

it("is pending while counting down or paying, not once settled", () => {
  const due = { at: 1, stallId: "s", stall: "S", total: 100 };
  expect(autoPending(due)).toBe(true);
  expect(autoPending({ ...due, paying: true })).toBe(true);
  expect(autoPending({ ...due, done: true, paid: true })).toBe(false);
  expect(autoPending({ ...due, stopped: true })).toBe(false);
  expect(autoPending({ skipped: "no-deal" })).toBe(false);
});
