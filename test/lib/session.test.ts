import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSession, sealSession } from "@/lib/session";

const DAY = 60 * 60 * 24;

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-please-change");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("session cookie", () => {
  it("round-trips the user and email", () => {
    const cookie = sealSession("did:ethr:0xabc", "ramu@example.com", DAY);
    expect(openSession(cookie)).toMatchObject({
      user: "did:ethr:0xabc",
      email: "ramu@example.com",
    });
  });

  it("rejects a cookie whose payload was edited", () => {
    const [, sig] = sealSession("did:a", "a@example.com", DAY).split(".");
    const forged = Buffer.from(
      JSON.stringify({ user: "did:admin", email: "a@example.com", exp: 9e9 }),
    ).toString("base64url");
    expect(openSession(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a cookie signed with another secret", () => {
    const cookie = sealSession("did:a", "a@example.com", DAY);
    vi.stubEnv("SESSION_SECRET", "a-different-secret");
    expect(openSession(cookie)).toBeNull();
  });

  it("rejects an expired cookie", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    const cookie = sealSession("did:a", "a@example.com", DAY);
    vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
    expect(openSession(cookie)).toBeNull();
  });

  it.each([undefined, "", "abc", "a.b.c", "!!.??"])("rejects malformed value %j", (value) => {
    expect(openSession(value)).toBeNull();
  });

  it("refuses to sign without a secret", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => sealSession("did:a", "a@example.com", DAY)).toThrow(/SESSION_SECRET/);
  });
});
