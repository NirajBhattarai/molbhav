import { beforeAll, describe, expect, it } from "vitest";
import { agentCard, type StallAgent } from "@/lib/server/a2a/stall";

const sample: StallAgent = {
  stallId: "u-test",
  agentId: "agent_0123456789",
  name: "Ramu Tea Stall",
  style: "friendly",
  lang: "en",
  open: true,
  lat: 26.92,
  lng: 75.82,
  items: [{ id: 1, name: "Chai", words: "tea chai", price: 20, lowest: 12 }],
};

describe("agentCard", () => {
  beforeAll(() => {
    if (!process.env.SESSION_SECRET && !process.env.A2A_SIGNING_SECRET) {
      process.env.SESSION_SECRET = "test-session-secret-for-a2a-cards";
    }
  });

  it("exposes A2A top-level fields and bargain extension menu, never lowest", () => {
    const card = agentCard(sample, "http://localhost:3000");
    expect(card.name).toBe("Ramu Tea Stall");
    expect(card.supportedInterfaces[0]?.url).toBe(
      "http://localhost:3000/a2a/agents/agent_0123456789",
    );
    expect(card.capabilities.streaming).toBe(true);
    const ext = card.capabilities.extensions[0];
    expect(ext?.uri).toContain("/a2a/extensions/bargain/v1");
    expect(ext?.params.status).toBe("open");
    expect(ext?.params.menu).toEqual([{ name: "Chai", aliases: ["tea", "chai"], priceInr: 20 }]);
    // Floor stays off the wire (prose may say "lowest price"; the number must not).
    expect(JSON.stringify(ext?.params)).not.toContain('"lowest"');
    expect(JSON.stringify(ext?.params)).not.toContain(":12");
    expect(ext?.params.offerKey).toMatchObject({ kty: "OKP", crv: "Ed25519" });
    expect(typeof ext?.params.offerKey.x).toBe("string");
  });
});
