import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redisOn: true,
  store: new Map<string, { value: string; ex?: number }>(),
  get: vi.fn(async (key: string) => h.store.get(key)?.value ?? null),
  set: vi.fn(async (key: string, value: string, opts?: { EX?: number }) => {
    h.store.set(key, { value, ex: opts?.EX });
  }),
  rows: [] as { discovery: string }[],
  queries: [] as { text: string; params: unknown[] }[],
}));

vi.mock("@/lib/server/redis", () => ({
  redisConfigured: () => h.redisOn,
  redis: async () => ({ get: h.get, set: h.set }),
}));

vi.mock("@/lib/server/db", () => ({
  query: async (text: string, params: unknown[] = []) => {
    h.queries.push({ text, params });
    return h.rows;
  },
}));

const load = () => import("@/lib/server/discovery");

const userId = "user-1";
const key = `user-discovery:${userId}`;

beforeEach(() => {
  vi.resetModules();
  h.redisOn = true;
  h.store.clear();
  h.rows = [];
  h.queries = [];
  h.get.mockClear();
  h.set.mockClear();
  h.get.mockImplementation(async (k: string) => h.store.get(k)?.value ?? null);
  h.set.mockImplementation(async (k: string, value: string, opts?: { EX?: number }) => {
    h.store.set(k, { value, ex: opts?.EX });
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("discoveryCacheTtl", () => {
  it("defaults to 300 seconds", async () => {
    vi.stubEnv("DISCOVERY_CACHE_TTL", "");
    const { discoveryCacheTtl } = await load();
    expect(discoveryCacheTtl()).toBe(300);
  });

  it("reads DISCOVERY_CACHE_TTL when positive", async () => {
    vi.stubEnv("DISCOVERY_CACHE_TTL", "120");
    const { discoveryCacheTtl } = await load();
    expect(discoveryCacheTtl()).toBe(120);
  });

  it("falls back when the env value is invalid", async () => {
    vi.stubEnv("DISCOVERY_CACHE_TTL", "-5");
    const { discoveryCacheTtl } = await load();
    expect(discoveryCacheTtl()).toBe(300);
  });
});

describe("buyer discovery (Redis in front of Postgres)", () => {
  it("getDiscovery serves from Redis when present", async () => {
    h.store.set(key, { value: "location" });
    const { getDiscovery } = await load();
    expect(await getDiscovery(userId)).toBe("location");
    expect(h.queries).toHaveLength(0);
  });

  it("getDiscovery reads Postgres on a miss and caches in Redis", async () => {
    h.rows = [{ discovery: "location" }];
    const { getDiscovery } = await load();
    expect(await getDiscovery(userId)).toBe("location");
    expect(h.queries[0]?.text).toMatch(/SELECT discovery FROM users/);
    expect(h.store.get(key)).toEqual({ value: "location", ex: 300 });

    h.rows = [];
    h.queries = [];
    expect(await getDiscovery(userId)).toBe("location");
    expect(h.queries).toHaveLength(0);
  });

  it("defaults to nearby when the user has no row", async () => {
    h.rows = [];
    const { getDiscovery } = await load();
    expect(await getDiscovery(userId)).toBe("nearby");
    expect(h.store.get(key)?.value).toBe("nearby");
  });

  it("ignores a corrupt Redis value and reloads from Postgres", async () => {
    h.store.set(key, { value: "not-a-mode" });
    h.rows = [{ discovery: "location" }];
    const { getDiscovery } = await load();
    expect(await getDiscovery(userId)).toBe("location");
    expect(h.store.get(key)?.value).toBe("location");
  });

  it("saveDiscovery writes Postgres then Redis with TTL", async () => {
    vi.stubEnv("DISCOVERY_CACHE_TTL", "90");
    const { saveDiscovery } = await load();
    await saveDiscovery(userId, "location");
    expect(h.queries[0]).toEqual({
      text: "UPDATE users SET discovery = $2 WHERE id = $1",
      params: [userId, "location"],
    });
    expect(h.set).toHaveBeenCalledWith(key, "location", { EX: 90 });
    expect(h.store.get(key)).toEqual({ value: "location", ex: 90 });
  });

  it("keeps working from Postgres when Redis is down", async () => {
    h.get.mockRejectedValue(new Error("down"));
    h.set.mockRejectedValue(new Error("down"));
    h.rows = [{ discovery: "location" }];
    const { getDiscovery, saveDiscovery } = await load();
    expect(await getDiscovery(userId)).toBe("location");
    await saveDiscovery(userId, "nearby");
    expect(h.queries.some((q) => /UPDATE users SET discovery/.test(q.text))).toBe(true);
  });

  it("skips Redis entirely when REDIS_URL is not configured", async () => {
    h.redisOn = false;
    h.rows = [{ discovery: "location" }];
    const { getDiscovery, saveDiscovery } = await load();
    expect(await getDiscovery(userId)).toBe("location");
    expect(h.get).not.toHaveBeenCalled();
    await saveDiscovery(userId, "nearby");
    expect(h.set).not.toHaveBeenCalled();
    expect(h.queries.at(-1)?.params).toEqual([userId, "nearby"]);
  });
});
