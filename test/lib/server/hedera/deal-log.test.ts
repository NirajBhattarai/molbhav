import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const after = vi.fn((run: () => unknown) => void run());
vi.mock("next/server", () => ({ after: (run: () => unknown) => after(run) }));
const query = vi.fn();
vi.mock("@/lib/server/db", () => ({ query: (...a: unknown[]) => query(...a) }));

const sent: { topic: string; message: string }[] = [];
vi.mock("@hiero-ledger/sdk", () => {
  class TopicMessageSubmitTransaction {
    topic = "";
    message = "";
    setTopicId(t: string) {
      this.topic = t;
      return this;
    }
    setMessage(m: string) {
      this.message = m;
      return this;
    }
    async execute() {
      sent.push({ topic: this.topic, message: this.message });
      return { getReceipt: async () => ({ topicSequenceNumber: sent.length }) };
    }
  }
  const client = { setOperator: () => client, setDefaultMaxTransactionFee: () => client };
  return {
    TopicMessageSubmitTransaction,
    Client: { forTestnet: () => client, forMainnet: () => client },
    Hbar: class {},
    PrivateKey: { fromStringDer: () => ({}) },
  };
});

import { dealLogUrl, logDealAgreed, logDealPaid, postDeal } from "@/lib/server/hedera/deal-log";

const BARGAIN = "0b0c2f5e-2d1f-4a9a-9d0e-6a3b8f1c2d3e";
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  sent.length = 0;
  query.mockReset();
  vi.stubEnv("HEDERA_OPERATOR_ID", "0.0.6649686");
  vi.stubEnv("HEDERA_OPERATOR_KEY", "302e020100300506032b657004220420aa");
  vi.stubEnv("HEDERA_DEAL_TOPIC", "0.0.11345649");
  vi.stubEnv("NEXT_PUBLIC_HEDERA_NETWORK", "testnet");
});
afterEach(() => vi.unstubAllEnvs());

describe("deal log", () => {
  it("does nothing until the operator and topic are set", async () => {
    vi.stubEnv("HEDERA_DEAL_TOPIC", "");
    await expect(
      postDeal({
        type: "deal.paid",
        bargain: BARGAIN,
        stall: "u-1",
        ens: null,
        payTo: "0.0.1",
        amount: "1",
        payTx: "x",
      }),
    ).resolves.toBeNull();
    expect(sent).toHaveLength(0);
    expect(dealLogUrl()).toBeNull();
  });

  it("links the topic on HashScan", () => {
    expect(dealLogUrl()).toBe("https://hashscan.io/testnet/topic/0.0.11345649");
  });

  it("posts an agreed deal with the stall's live ENS name and no buyer", async () => {
    query.mockResolvedValue([
      { ens_label: "niraj-briyani", ens_status: "live", agent_id: "agent_ccc", item: "Biryani" },
    ]);
    logDealAgreed(BARGAIN, "u-de9ef328", 190);
    await flush();
    expect(after).toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].topic).toBe("0.0.11345649");
    const msg = JSON.parse(sent[0].message);
    expect(msg).toMatchObject({
      v: 1,
      type: "deal.agreed",
      bargain: BARGAIN,
      stall: "u-de9ef328",
      ens: "niraj-briyani.molbhav.eth",
      agent: "agent_ccc",
      item: "Biryani",
      priceInr: 190,
    });
    expect(msg.at).toEqual(expect.any(String));
    expect(JSON.stringify(msg)).not.toMatch(/did:ethr|buyer/);
  });

  it("leaves the name out until it is live", async () => {
    query.mockResolvedValue([
      { ens_label: "mohd-soyeb-khan", ens_status: "resolver", agent_id: null, item: "Chai" },
    ]);
    logDealAgreed(BARGAIN, "u-f8095aba", 20);
    await flush();
    expect(JSON.parse(sent[0].message).ens).toBeNull();
  });

  it("posts a paid deal with its x402 settlement", async () => {
    query.mockResolvedValue([]);
    logDealPaid(BARGAIN, "u-1", {
      payTo: "0.0.11345070",
      amount: "1267000000",
      payTx: "0.0.9185802@1793992758.336517547",
    });
    await flush();
    expect(JSON.parse(sent[0].message)).toMatchObject({
      type: "deal.paid",
      payTo: "0.0.11345070",
      amount: "1267000000",
      payTx: "0.0.9185802@1793992758.336517547",
      ens: null,
    });
  });

  it("never throws when Hedera fails", async () => {
    query.mockRejectedValue(new Error("db down"));
    expect(() => logDealAgreed(BARGAIN, "u-1", 10)).not.toThrow();
    await flush();
    expect(sent).toHaveLength(0);
  });
});
