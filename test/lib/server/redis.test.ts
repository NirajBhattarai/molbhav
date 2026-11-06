import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  createClient: vi.fn(),
  connect: vi.fn(),
  on: vi.fn(),
}));
vi.mock("redis", () => ({ createClient: fake.createClient }));

beforeEach(() => {
  vi.resetModules();
  const client = { on: fake.on, connect: fake.connect };
  fake.on.mockReturnValue(client);
  fake.connect.mockResolvedValue(client);
  fake.createClient.mockReturnValue(client);
});

afterEach(() => vi.unstubAllEnvs());

const load = () => import("@/lib/server/redis");

describe("redis", () => {
  it("is off without REDIS_URL", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { redis, redisConfigured } = await load();
    expect(redisConfigured()).toBe(false);
    expect(() => redis()).toThrow(/REDIS_URL/);
  });

  it("connects once and shares the client", async () => {
    vi.stubEnv("REDIS_URL", "redis://default:pw@localhost:6379");
    const { redis, redisConfigured } = await load();
    expect(redisConfigured()).toBe(true);
    const [a, b] = await Promise.all([redis(), redis()]);
    expect(a).toBe(b);
    expect(fake.createClient).toHaveBeenCalledTimes(1);
    expect(fake.createClient).toHaveBeenCalledWith({ url: "redis://default:pw@localhost:6379" });
    expect(fake.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("tries again after a failed connection", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    fake.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { redis } = await load();
    await expect(redis()).rejects.toThrow("ECONNREFUSED");
    await expect(redis()).resolves.toBeDefined();
    expect(fake.createClient).toHaveBeenCalledTimes(2);
  });
});
