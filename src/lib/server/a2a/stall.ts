import "server-only";
import { A2A_VERSION } from "@/lib/a2a/protocol";
import { extensionUri } from "@/lib/a2a/extensions";
import { agentKeys } from "@/lib/server/a2a/keys";
import { query } from "@/lib/server/db";
import type { Lang } from "@/lib/languages";

/** Stall agent ids look like `agent_` + 10 hex (from sha256 of UPI). */
export const AGENT_ID = /^agent_[0-9a-f]{10}$/;

export type StallStyle = "friendly" | "firm";

export type StallAgentItem = {
  id: number;
  name: string;
  words: string;
  price: number;
  lowest: number;
};

/**
 * A published stall agent: named, has UPI (so agent_id), and at least one active item.
 * Closed stalls still have a card — status says closed.
 */
export type StallAgent = {
  stallId: string;
  agentId: string;
  name: string;
  style: StallStyle;
  lang: Lang;
  open: boolean;
  lat: number | null;
  lng: number | null;
  items: StallAgentItem[];
};

/** Absolute URLs of a stall agent's Agent Card and JSON-RPC endpoint. */
export const agentUrls = (base: string, agentId: string) => ({
  card: `${base}/a2a/agents/${agentId}/.well-known/agent-card.json`,
  endpoint: `${base}/a2a/agents/${agentId}`,
});

const menuOf = (agent: StallAgent) =>
  agent.items.map((i) => ({
    name: i.name,
    aliases: i.words.split(" ").filter(Boolean),
    priceInr: i.price,
  }));

/**
 * The stall agent's Agent Card (A2A v1.0): who it is, where to talk, what it can do.
 * Molbhav data (offer key, public menu, open/closed) lives in the bargain extension's params.
 * Never exposes lowest prices, owner, or UPI.
 */
export function agentCard(agent: StallAgent, base: string) {
  const { endpoint } = agentUrls(base, agent.agentId);
  const ext = extensionUri(base, "bargain");
  return {
    name: agent.name,
    description:
      `Molbhav stall agent for ${agent.name}. Quotes and bargains in rupees, ` +
      `${agent.style === "firm" ? "firmly" : "in a friendly way"}; never below the stall's lowest price.`,
    version: "1.0.0",
    supportedInterfaces: [
      { url: endpoint, protocolBinding: "JSONRPC", protocolVersion: A2A_VERSION },
    ],
    provider: { organization: "Molbhav", url: base },
    documentationUrl: ext,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions: [
        {
          uri: ext,
          description:
            "Molbhav's bargaining messages (rfq, counter, accept, decline) and signed offers.",
          required: true,
          params: {
            agentId: agent.agentId,
            status: agent.open ? "open" : "closed",
            style: agent.style,
            lang: agent.lang,
            offerKey: { kty: "OKP", crv: "Ed25519", x: agentKeys(agent.agentId).publicKey },
            menu: menuOf(agent),
          },
        },
      ],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "bazaar-negotiate",
        name: "Quote and bargain",
        description:
          "rfq {basket:[{item,qty}]} → signed offer for the items it sells; " +
          "counter {targetInr, competing?} → better signed offer, never below the stall's lowest; " +
          "accept {offerId} → deal with the UPI ID and a upi:// link to pay; decline.",
        tags: ["negotiation", "bazaar", "upi", "india"],
        examples: [
          '{"type":"rfq","basket":[{"item":"saree","qty":1}]}',
          '{"type":"counter","targetInr":4500}',
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

/**
 * The stall behind an agent id, with its menu; null unless published (named, UPI → agent_id, menu).
 * A closed stall still returns a card that says closed.
 */
export async function stallAgent(agentId: string): Promise<StallAgent | null> {
  if (!AGENT_ID.test(agentId)) return null;
  const rows = await query<{
    id: string;
    agent_id: string;
    name: string;
    style: StallStyle;
    lang: Lang;
    is_open: boolean;
    lat: number | null;
    lng: number | null;
    items: StallAgentItem[];
  }>(
    `SELECT s.id, s.agent_id, s.name, s.style, s.lang, s.is_open, s.lat, s.lng,
       json_agg(json_build_object('id', i.id, 'name', i.name, 'words', i.words, 'price', i.price,
         'lowest', i.lowest) ORDER BY i.id) AS items
     FROM stalls s
     JOIN stall_items i ON i.stall_id = s.id AND i.active
     WHERE s.agent_id = $1 AND s.name <> '' AND s.upi_id IS NOT NULL
     GROUP BY s.id`,
    [agentId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    stallId: r.id,
    agentId: r.agent_id,
    name: r.name,
    style: r.style,
    lang: r.lang,
    open: r.is_open && r.lat !== null,
    lat: r.lat,
    lng: r.lng,
    items: r.items,
  };
}
