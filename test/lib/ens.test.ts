import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVM_COIN,
  HEDERA_TESTNET_COIN,
  KEY,
  evmCoinType,
  freeLabel,
  ownerAddress,
  recordsKey,
  stallLabel,
  stallRecords,
} from "@/lib/ens";

describe("stallLabel", () => {
  it("turns a stall name into an ENS label", () => {
    expect(stallLabel("MOHD SOYEB KHAN")).toBe("mohd-soyeb-khan");
    expect(stallLabel("Meena's Kitchen")).toBe("meena-s-kitchen");
    expect(stallLabel("  Café Noor!! ")).toBe("cafe-noor");
  });

  it("gives nothing for names with no usable letters", () => {
    expect(stallLabel("")).toBeNull();
    expect(stallLabel("ठेला")).toBeNull();
    expect(stallLabel("a!")).toBeNull();
  });

  it("caps the length without a trailing hyphen", () => {
    const label = stallLabel("a".repeat(39) + " b")!;
    expect(label.length).toBeLessThanOrEqual(40);
    expect(label.endsWith("-")).toBe(false);
  });
});

describe("freeLabel", () => {
  it("adds a number when the label is taken", () => {
    const taken = new Set(["chai", "chai-2"]);
    expect(freeLabel("chai", (l) => taken.has(l))).toBe("chai-3");
    expect(freeLabel("momo", (l) => taken.has(l))).toBe("momo");
  });
});

describe("ownerAddress", () => {
  it("reads the wallet out of a Magic did:ethr id", () => {
    const a = "0x2E8d9978D48f18eb34AD0D6c5c9E2B2B5c006516";
    expect(ownerAddress(`did:ethr:${a}`)).toBe(a);
    expect(ownerAddress(`did:ethr:sepolia:${a}`)).toBe(a);
    expect(ownerAddress("near-owner-x")).toBeNull();
  });
});

describe("coin types", () => {
  it("follows ENSIP-11", () => {
    expect(DEFAULT_EVM_COIN).toBe(0x80000000);
    expect(HEDERA_TESTNET_COIN).toBe(2147483944);
    expect(evmCoinType(61)).toBe(2147483709); // the ENSIP-11 example
  });
});

describe("stallRecords", () => {
  const base = {
    name: "MOHD SOYEB KHAN",
    agentId: "agent_078a8df588",
    cardUrl: "https://x.test/a2a/agents/agent_078a8df588/.well-known/agent-card.json",
    site: "https://x.test",
    payout: "0x2E8d9978D48f18eb34AD0D6c5c9E2B2B5c006516" as const,
  };

  it("points agents at the Agent Card and pays the owner", () => {
    const r = stallRecords(base);
    expect(r.texts.find((t) => t.key === KEY.a2a)?.value).toBe(base.cardUrl);
    expect(JSON.parse(r.texts.find((t) => t.key === KEY.context)!.value)).toMatchObject({
      agentId: base.agentId,
      card: base.cardUrl,
    });
    expect(r.coins.map((c) => c.coin)).toEqual([DEFAULT_EVM_COIN, HEDERA_TESTNET_COIN]);
  });

  it("records the owner's Magic Hedera account as the Hedera address", () => {
    const hederaPayout = "0x0000000000000000000000000000000000acdcec" as const; // 0.0.11328748
    const coins = stallRecords({ ...base, hederaPayout }).coins;
    expect(coins).toContainEqual({ coin: HEDERA_TESTNET_COIN, value: hederaPayout });
    expect(coins).toContainEqual({ coin: DEFAULT_EVM_COIN, value: base.payout });
  });

  it("leaves out addresses when the owner has no wallet", () => {
    expect(stallRecords({ ...base, payout: null }).coins).toEqual([]);
  });

  it("fingerprints records regardless of order and address case", () => {
    const a = stallRecords(base);
    const b = {
      texts: [...a.texts].reverse(),
      coins: a.coins.map((c) => ({ ...c, value: c.value.toLowerCase() })),
    };
    expect(recordsKey(a)).toBe(recordsKey(b));
    expect(recordsKey(a)).not.toBe(recordsKey(stallRecords({ ...base, name: "Other" })));
  });
});
