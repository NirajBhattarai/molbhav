import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClaimPack, parseClaimPack } from "@/lib/server/sign-claim";

describe("claim pack", () => {
  it("round-trips agent, token, server, name", () => {
    const pack = buildClaimPack({
      agentId: "agent_078a8df588",
      deviceToken: "abc123token",
      server: "https://molbhav-eta.vercel.app/",
      stallName: "Ramesh Sabzi",
    });
    expect(pack.startsWith("mb1|")).toBe(true);
    expect(parseClaimPack(pack)).toEqual({
      agentId: "agent_078a8df588",
      deviceToken: "abc123token",
      server: "https://molbhav-eta.vercel.app",
      stallName: "Ramesh Sabzi",
    });
  });

  it("rejects junk", () => {
    expect(parseClaimPack("nope")).toBeNull();
    expect(parseClaimPack("mb1|bad|t|s|n")).toBeNull();
  });
});

// ---- Who may claim a sign ----

type Row = {
  chip_id: string;
  claim_code: string;
  stall_id: string | null;
  agent_id: string | null;
  expires_at: Date;
  claimed_at: Date | null;
  secret_hash: string | null;
};

const fake = vi.hoisted(() => ({ rows: new Map<string, Row>(), allow: true }));

/** Just enough of sign_claims and stalls for these queries. */
vi.mock("@/lib/server/db", () => ({
  query: vi.fn(async (sql: string, p: unknown[] = []) => {
    if (sql.startsWith("SELECT name, upi_id FROM stalls"))
      return [{ name: "Ramesh Sabzi", upi_id: "ramesh@upi" }];
    if (sql.includes("FROM sign_claims WHERE chip_id")) {
      const row = fake.rows.get(p[0] as string);
      return row ? [{ ...row }] : [];
    }
    if (sql.startsWith("UPDATE sign_claims SET secret_hash")) {
      const row = fake.rows.get(p[0] as string);
      if (row && !row.secret_hash) row.secret_hash = p[1] as string;
      return [];
    }
    if (sql.startsWith("INSERT INTO sign_claims")) {
      const [chip, code, expires, hash] = p as [string, string, Date, string];
      const row = fake.rows.get(chip);
      const fresh: Row = {
        chip_id: chip,
        claim_code: code,
        expires_at: expires,
        secret_hash: hash,
        stall_id: null,
        agent_id: null,
        claimed_at: null,
      };
      if (!row) fake.rows.set(chip, fresh);
      else if (
        !row.claimed_at &&
        (!row.secret_hash || row.secret_hash === hash || row.expires_at < new Date())
      )
        fake.rows.set(chip, fresh);
      return [];
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }),
}));
vi.mock("@/lib/server/rate-limit", () => ({ withinLimit: vi.fn(async () => fake.allow) }));

const claims = await import("@/lib/server/sign-claim");

const CHIP = "a1b2c3d4e5f6";
const MINE = "0123456789abcdef0123456789abcdef";
const THEIRS = "fedcba9876543210fedcba9876543210";
const AGENT = "agent_078a8df588";

function claimed(secretHash: string | null): Row {
  return {
    chip_id: CHIP,
    claim_code: "123456",
    stall_id: "s1",
    agent_id: AGENT,
    expires_at: new Date(Date.now() - 60_000),
    claimed_at: new Date(),
    secret_hash: secretHash,
  };
}

beforeEach(() => {
  fake.rows.clear();
  fake.allow = true;
  vi.stubEnv("SESSION_SECRET", "test-secret");
});

describe("registering a sign", () => {
  it("needs the chip's secret", async () => {
    expect(await claims.registerSignChip(CHIP, "")).toEqual({ error: "bad_secret" });
    expect(await claims.registerSignChip(CHIP, "short")).toEqual({ error: "bad_secret" });
  });

  it("gives a new chip a 6-digit code", async () => {
    const res = await claims.registerSignChip(CHIP, MINE);
    expect(res).toMatchObject({ status: "waiting", claimCode: expect.stringMatching(/^\d{6}$/) });
  });

  it("won't hand a waiting chip's code to another secret", async () => {
    await claims.registerSignChip(CHIP, MINE);
    expect(await claims.registerSignChip(CHIP, THEIRS)).toEqual({ error: "forbidden" });
    expect(await claims.pollSignClaim(CHIP, THEIRS)).toEqual({ error: "forbidden" });
  });

  it("lets a new secret take over a code nobody claimed and that expired", async () => {
    await claims.registerSignChip(CHIP, MINE);
    fake.rows.get(CHIP)!.expires_at = new Date(Date.now() - 1000);
    expect(await claims.registerSignChip(CHIP, THEIRS)).toMatchObject({ status: "waiting" });
  });
});

describe("a claimed sign's credentials", () => {
  it("go to the chip's own secret", async () => {
    fake.rows.set(CHIP, claimed(claims.hashClaimSecret(MINE)));
    const res = await claims.pollSignClaim(CHIP, MINE);
    expect(res).toMatchObject({ status: "claimed", agentId: AGENT, stallName: "Ramesh Sabzi" });
    expect((res as { deviceToken: string }).deviceToken).toMatch(/^[0-9a-f]{32}$/);
    expect(await claims.registerSignChip(CHIP, MINE)).toMatchObject({ status: "claimed" });
  });

  it("never go to someone who only knows the chip id", async () => {
    fake.rows.set(CHIP, claimed(claims.hashClaimSecret(MINE)));
    expect(await claims.pollSignClaim(CHIP, THEIRS)).toEqual({ error: "forbidden" });
    expect(await claims.registerSignChip(CHIP, THEIRS)).toEqual({ error: "forbidden" });
    expect(fake.rows.get(CHIP)!.claimed_at).not.toBeNull();
  });

  it("go to the first secret for a sign claimed before secrets, then only to it", async () => {
    fake.rows.set(CHIP, claimed(null));
    expect(await claims.pollSignClaim(CHIP, MINE)).toEqual({ error: "forbidden" });
    expect(await claims.registerSignChip(CHIP, MINE)).toMatchObject({ status: "claimed" });
    expect(await claims.registerSignChip(CHIP, THEIRS)).toEqual({ error: "forbidden" });
  });
});

describe("entering a claim code", () => {
  it("stops after too many tries", async () => {
    fake.allow = false;
    expect(await claims.claimSignWithCode("did:ramu", "123456")).toEqual({
      error: expect.stringContaining("Too many tries"),
    });
  });
});
