import "server-only";
import {
  A2A_VERSION,
  dataOf,
  userMessage,
  type BuyerIntent,
  type StallReply,
  type Task,
} from "@/lib/a2a/protocol";
import {
  INTERNAL_HEADER,
  internalToken,
  verifyOffer,
  type InternalRole,
} from "@/lib/server/a2a/keys";

/*
 * A2A client for Molbhav's own callers (app buyer agent). Talks to stall agents over HTTP
 * the same way an outside agent would: card → SendMessage. Identifies with X-Molbhav-Client
 * so stalls skip the stranger rate limit and don't double-record app deals.
 */

/** A JSON-RPC error from an agent, or an HTTP failure reaching one. */
export class A2aCallError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

/** What a stall agent's card says, as the client needs it. */
export type StallCard = {
  agentId: string;
  name: string;
  endpoint: string;
  /** The bargain extension's URI, sent in A2A-Extensions. */
  extension: string;
  /** Ed25519 public key (base64url) its offers are signed with. */
  offerKey: string;
  style: "friendly" | "firm";
  lang: string;
  open: boolean;
  menu: { name: string; aliases: string[]; priceInr: number }[];
};

type Card = {
  name: string;
  supportedInterfaces?: { url: string; protocolBinding: string; protocolVersion: string }[];
  capabilities?: { extensions?: { uri: string; params?: Record<string, unknown> }[] };
};

const jsonRpcUrl = (card: Card) =>
  card.supportedInterfaces?.find(
    (i) => i.protocolBinding === "JSONRPC" && i.protocolVersion === A2A_VERSION,
  )?.url;

const extensionOf = (card: Card, name: string) =>
  card.capabilities?.extensions?.find((e) => e.uri.endsWith(`/extensions/${name}/v1`));

/** Longest one JSON-RPC call may take (stall Gemini ~10 s). */
export const CALL_TIMEOUT_MS = 12_000;

/** Public origin where this app's A2A agents live (no request headers). */
export function appBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "https://molbhav-eta.vercel.app";
  const server = raw.replace(/\/$/, "");
  return server.startsWith("http") ? server : `https://${server}`;
}

export function a2aClient(base: string, role?: InternalRole, fetcher: typeof fetch = fetch) {
  let id = 0;
  const cards = new Map<string, Promise<Card>>();

  const cardAt = (url: string) => {
    let hit = cards.get(url);
    if (!hit) {
      hit = fetcher(url, { cache: "no-store" }).then(async (res) => {
        if (!res.ok) throw new A2aCallError(-32001, `no agent card at ${url} (HTTP ${res.status})`);
        return (await res.json()) as Card;
      });
      cards.set(url, hit);
    }
    return hit;
  };

  async function call<T>(url: string, extension: string, method: string, params: unknown) {
    const res = await fetcher(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "A2A-Version": A2A_VERSION,
        "A2A-Extensions": extension,
        ...(role && { [INTERNAL_HEADER]: internalToken(role) }),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = (await res.json().catch(() => null)) as {
      result?: T;
      error?: { code: number; message: string };
    } | null;
    if (!body) throw new A2aCallError(-32603, `HTTP ${res.status} from ${url}`);
    if (body.error) throw new A2aCallError(body.error.code, body.error.message);
    return body.result as T;
  }

  return {
    base,

    /** A stall agent, from its card URL. */
    async stall(cardUrl: string): Promise<StallCard> {
      const card = await cardAt(cardUrl);
      const endpoint = jsonRpcUrl(card);
      const ext = extensionOf(card, "bargain");
      const p = (ext?.params ?? {}) as {
        agentId?: string;
        offerKey?: { x?: string };
        style?: "friendly" | "firm";
        lang?: string;
        status?: string;
        menu?: StallCard["menu"];
      };
      if (!endpoint || !ext || !p.agentId || !p.offerKey?.x)
        throw new A2aCallError(-32603, `${cardUrl} isn't a Molbhav stall agent card`);
      return {
        agentId: p.agentId,
        name: card.name,
        endpoint,
        extension: ext.uri,
        offerKey: p.offerKey.x,
        style: p.style === "firm" ? "firm" : "friendly",
        lang: p.lang ?? "en",
        open: p.status === "open",
        menu: Array.isArray(p.menu) ? p.menu : [],
      };
    },

    /** Stall card by agent id at this client's base. */
    stallById(agentId: string) {
      return this.stall(`${base}/a2a/agents/${agentId}/.well-known/agent-card.json`);
    },

    /**
     * One message to a stall agent. `text` is what the buyer's agent says alongside the intent.
     * Offers are checked against the stall's key.
     */
    async send(
      stall: StallCard,
      intent: BuyerIntent,
      opts: { taskId?: string; contextId?: string; text?: string } = {},
    ): Promise<{ task: Task; reply: StallReply | undefined }> {
      const message = userMessage(intent, stall.extension, {
        taskId: opts.taskId,
        contextId: opts.contextId,
      });
      if (opts.text) message.parts = [{ text: opts.text }, ...message.parts];
      const { task } = await call<{ task: Task }>(stall.endpoint, stall.extension, "SendMessage", {
        message,
      });
      const reply = dataOf<StallReply>(task.status.message);
      if (reply && "offer" in reply && !verifyOffer(reply.offer, stall.offerKey))
        throw new A2aCallError(-32603, `${stall.name} sent an offer its key doesn't sign`);
      return { task, reply };
    },
  };
}

export type A2aClient = ReturnType<typeof a2aClient>;

/** The app's buyer-agent A2A client (internal "app" role). */
export const appClient = (): A2aClient => a2aClient(appBase(), "app");
