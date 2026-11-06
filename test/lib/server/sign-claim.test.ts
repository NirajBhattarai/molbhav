import { describe, expect, it } from "vitest";
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
