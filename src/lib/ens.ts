/*
 * ENS names for stall agents (ENSv2): every stall agent is a namespace under the market's name,
 * e.g. mohd-soyeb-khan.molbhav.eth, with the records a buyer's agent needs to find and pay it.
 * Pure (no network): what the name is and what it says. Writing it is server/ens.ts.
 */
import { normalize } from "viem/ens";

/** The market's own name; every stall agent gets a subname of it. */
export const ENS_PARENT_DEFAULT = "molbhav.eth";

/** A stall agent's full name: <label>.<ENS_PARENT>. */
export const ensName = (
  label: string,
  parent = process.env.ENS_PARENT?.trim() || ENS_PARENT_DEFAULT,
) => `${label}.${parent}`;

/** ENSIP-11: an EVM chain's coin type is 0x80000000 | chainId. 0x80000000 alone = any EVM chain. */
export const evmCoinType = (chainId: number) => (0x80000000 | chainId) >>> 0;
export const DEFAULT_EVM_COIN = evmCoinType(0);
/** Hedera testnet's EVM (chain 296): where buyer agents will pay the stall. */
export const HEDERA_TESTNET_COIN = evmCoinType(296);

/** Text keys (ENSIP-26 agent records, plus the usual profile keys). */
export const KEY = {
  context: "agent-context",
  a2a: "agent-endpoint[a2a]",
  description: "description",
  url: "url",
} as const;

/** The keys and coins a shop owner may change on their own name (Enhanced Access Control). */
export const OWNER_EDITS = {
  texts: [KEY.description],
  coins: [HEDERA_TESTNET_COIN],
} as const;

const LABEL_MAX = 40;

/**
 * A stall's name as an ENS label: lowercase ASCII words joined by hyphens ("Mohd Soyeb Khan" →
 * "mohd-soyeb-khan"). Accents fold away; anything else becomes a hyphen. Too short or empty → null.
 */
export function stallLabel(name: string): string | null {
  const label = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LABEL_MAX)
    .replace(/-+$/, "");
  if (label.length < 3) return null;
  try {
    return normalize(label) === label ? label : null;
  } catch {
    return null;
  }
}

/** The first of label, label-2, label-3 … that `taken` doesn't have. */
export function freeLabel(
  base: string,
  taken: (label: string) => boolean,
  tries = 50,
): string | null {
  for (let n = 1; n <= tries; n++) {
    const label = n === 1 ? base : `${base.slice(0, LABEL_MAX - String(n).length - 1)}-${n}`;
    if (!taken(label)) return label;
  }
  return null;
}

/** The wallet inside a Magic `did:ethr:[network:]0x…` user id, or null. */
export function ownerAddress(ownerId: string): `0x${string}` | null {
  const m = /^did:ethr:(?:[a-z0-9-]+:)?(0x[0-9a-fA-F]{40})$/.exec(ownerId.trim());
  return m ? (m[1] as `0x${string}`) : null;
}

export type StallRecordInput = {
  name: string;
  agentId: string;
  /** The stall agent's A2A Agent Card URL. */
  cardUrl: string;
  /** The market's public URL. */
  site: string;
  /** Where the stall is paid on EVM chains (the owner's wallet); null when unknown. */
  payout: `0x${string}` | null;
};

export type StallRecords = {
  texts: { key: string; value: string }[];
  coins: { coin: number; value: string }[];
};

/**
 * What a stall agent's name says. `agent-endpoint[a2a]` is the Agent Card a buyer's agent fetches;
 * `agent-context` tells any agent what this name is, in a few machine-readable lines.
 */
export function stallRecords(s: StallRecordInput): StallRecords {
  const context = JSON.stringify({
    kind: "molbhav-stall-agent",
    agentId: s.agentId,
    stall: s.name,
    protocol: "a2a/1.0",
    card: s.cardUrl,
    bargain: "rfq, counter, accept; prices are Ed25519-signed offers",
    pay: "x402 exact on hedera:testnet in HBAR, to this name's Hedera address",
  });
  return {
    texts: [
      { key: KEY.context, value: context },
      { key: KEY.a2a, value: s.cardUrl },
      { key: KEY.description, value: `${s.name}: a Molbhav stall. Ask its agent for a price.` },
      { key: KEY.url, value: s.site },
    ],
    coins: s.payout
      ? [
          { coin: DEFAULT_EVM_COIN, value: s.payout },
          { coin: HEDERA_TESTNET_COIN, value: s.payout },
        ]
      : [],
  };
}

/** A short fingerprint of the records, to tell whether the chain already has them. */
export function recordsKey(r: StallRecords): string {
  const texts = r.texts.map((t) => `${t.key}=${t.value}`).sort();
  const coins = r.coins.map((c) => `${c.coin}=${c.value.toLowerCase()}`).sort();
  return JSON.stringify([texts, coins]);
}
