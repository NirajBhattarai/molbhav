import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    query: vi.fn(),
    on: true,
    client: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => void store.set(k, v)),
      del: vi.fn(async (keys: string[]) => keys.forEach((k) => store.delete(k))),
    },
  };
});
vi.mock("@/lib/server/db", () => ({ query: fake.query, transaction: vi.fn() }));
vi.mock("@/lib/server/redis", () => ({
  redisConfigured: () => fake.on,
  redis: async () => fake.client,
}));

import { forgetOwnerAgent, ownerAgentId, ownerAgentMoved } from "@/lib/server/a2a/stall";

const A = "agent_0123456789";
const B = "agent_abcdefabcd";

beforeEach(() => {
  fake.store.clear();
  fake.on = true;
  fake.query.mockReset();
});

describe("owner → agent cache", () => {
  it("asks Postgres once, then answers from Redis", async () => {
    fake.query.mockResolvedValue([{ agent_id: A }]);
    expect(await ownerAgentId("u1")).toBe(A);
    expect(await ownerAgentId("u1")).toBe(A);
    expect(fake.query).toHaveBeenCalledTimes(1);
  });

  it("remembers a stall without an agent too", async () => {
    fake.query.mockResolvedValue([{ agent_id: null }]);
    expect(await ownerAgentId("u1")).toBeNull();
    expect(await ownerAgentId("u1")).toBeNull();
    expect(fake.query).toHaveBeenCalledTimes(1);
  });

  it("doesn't remember a failed lookup", async () => {
    fake.query.mockRejectedValueOnce(new Error("down")).mockResolvedValue([{ agent_id: A }]);
    expect(await ownerAgentId("u1")).toBeNull();
    expect(await ownerAgentId("u1")).toBe(A);
  });

  it("forgetOwnerAgent drops the cached agent body without a query", async () => {
    fake.store.set("owner-agent:u1", A);
    fake.store.set(`agent:${A}`, "{}");
    await forgetOwnerAgent("u1");
    expect(fake.store.has(`agent:${A}`)).toBe(false);
    expect(fake.query).not.toHaveBeenCalled();
  });

  it("a new UPI: remembers the new agent and drops both bodies", async () => {
    fake.store.set(`agent:${A}`, "{}");
    fake.store.set(`agent:${B}`, "{}");
    await ownerAgentMoved("u1", A, B);
    expect(fake.store.get("owner-agent:u1")).toBe(B);
    expect(fake.store.has(`agent:${A}`)).toBe(false);
    expect(fake.store.has(`agent:${B}`)).toBe(false);
  });

  it("does nothing without Redis", async () => {
    fake.on = false;
    await forgetOwnerAgent("u1");
    await ownerAgentMoved("u1", A, B);
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.client.set).not.toHaveBeenCalled();
  });
});
