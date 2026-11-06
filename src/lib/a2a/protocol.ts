/*
 * A2A (Agent2Agent) v1.0 wire types, as the spec spells them, and Molbhav's bargaining vocabulary.
 *   Spec:  https://a2a-protocol.org/latest/specification/  (a2a.proto is the source of truth)
 * JSON-RPC methods SendMessage, SendStreamingMessage, GetTask, SubscribeToTask, CancelTask; enums are
 * ProtoJSON names on the wire
 * (ROLE_USER, TASK_STATE_INPUT_REQUIRED). Molbhav's own messages (rfq, counter, accept, find) are
 * defined by two A2A extensions (extensions.ts) and travel as `data` parts.
 * No Node APIs: buyers' agents (browser, scripts, other servers) can import this too.
 * Prices on the wire are whole rupees (`…Inr`).
 */

export const A2A_VERSION = "1.0";

export type Role = "ROLE_USER" | "ROLE_AGENT";
export type TaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_AUTH_REQUIRED"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_REJECTED";

export const TERMINAL: readonly TaskState[] = [
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
];

/** One of text | raw | url | data; v1.0 has no `kind`, a part is told apart by which member is set. */
export type Part = { text?: string; data?: unknown; url?: string; mediaType?: string };

export type Message = {
  messageId: string;
  role: Role;
  parts: Part[];
  taskId?: string;
  contextId?: string;
  /** The extensions this message uses (their URIs). */
  extensions?: string[];
  metadata?: Record<string, unknown>;
};

export type TaskStatus = { state: TaskState; message?: Message; timestamp: string };
export type Artifact = { artifactId: string; name?: string; parts: Part[] };

export type Task = {
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
};

/** SendMessage's `configuration`. By default the call waits until the task ends or needs input. */
export type SendMessageConfiguration = {
  acceptedOutputModes?: string[];
  historyLength?: number;
  /** Answer at once with the task still working; follow it with GetTask or SubscribeToTask. */
  returnImmediately?: boolean;
};

/**
 * One event of a stream (SendStreamingMessage, SubscribeToTask), sent as SSE `data:` lines, each a
 * JSON-RPC response whose `result` is exactly one of these. The first is the task (or a lone message);
 * the stream closes once the task ends.
 */
export type StreamResponse =
  | { task: Task }
  | { message: Message }
  | { statusUpdate: { taskId: string; contextId: string; status: TaskStatus } }
  | {
      artifactUpdate: {
        taskId: string;
        contextId: string;
        artifact: Artifact;
        append?: boolean;
        lastChunk?: boolean;
      };
    };

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
};

/** JSON-RPC 2.0's own error codes, and A2A's (spec section 5.4), with the reason A2A names each by. */
export const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  taskNotFound: -32001,
  taskNotCancelable: -32002,
  pushNotificationNotSupported: -32003,
  unsupportedOperation: -32004,
  contentTypeNotSupported: -32005,
  extendedAgentCardNotConfigured: -32007,
  extensionSupportRequired: -32008,
  versionNotSupported: -32009,
} as const;

export const REASON: Partial<Record<number, string>> = {
  [RPC.taskNotFound]: "TASK_NOT_FOUND",
  [RPC.taskNotCancelable]: "TASK_NOT_CANCELABLE",
  [RPC.pushNotificationNotSupported]: "PUSH_NOTIFICATION_NOT_SUPPORTED",
  [RPC.unsupportedOperation]: "UNSUPPORTED_OPERATION",
  [RPC.contentTypeNotSupported]: "CONTENT_TYPE_NOT_SUPPORTED",
  [RPC.extendedAgentCardNotConfigured]: "EXTENDED_AGENT_CARD_NOT_CONFIGURED",
  [RPC.extensionSupportRequired]: "EXTENSION_SUPPORT_REQUIRED",
  [RPC.versionNotSupported]: "VERSION_NOT_SUPPORTED",
};

// ---- Bargaining (the bargain/v1 extension) ----

/** "2 chai": matched against the stall's item names and the other words buyers use for them. */
export type BasketLine = { item: string; qty: number };

/** A stall's price for a basket, signed with that stall agent's Ed25519 key. Binding until `validUntil`. */
export type Offer = {
  offerId: string;
  agentId: string;
  stallName: string;
  lines: { item: string; name: string; qty: number; unitInr: number }[];
  totalInr: number;
  round: number;
  validUntil: string;
  /** Ed25519 signature (base64url) over the canonical offer without this field. */
  sig: string;
};

/**
 * What a buyer's agent sends a stall agent. `languages` (app language codes, e.g. ["en","ta","hi"])
 * asks the stall to also say its reply in each, as `said`. A `final` counter is the buyer's last
 * offer: the stall takes it if it can, else names its final price.
 */
export type BuyerIntent =
  | { type: "rfq"; basket: BasketLine[]; languages?: string[] }
  | {
      type: "counter";
      targetInr: number;
      competing?: Offer;
      final?: boolean;
      languages?: string[];
    }
  | { type: "accept"; offerId: string }
  | { type: "decline" }
  /** Walking up to the stall: it welcomes you and shows its menu, on a task the rfq then continues. */
  | { type: "hello"; languages?: string[] };

/** Who to pay and how, given only once a deal is accepted. */
export type Payee = { vpa: string; name: string; upiLink: string };

/** What a stall agent answers. */
export type StallReply =
  /**
   * `missing`: basket items this stall doesn't sell; the offer covers the rest. `said`: the note in
   * each language the buyer asked for, by code, when the stall's AI said it.
   */
  | {
      type: "offer";
      offer: Offer;
      note: string;
      missing?: string[];
      said?: Record<string, string>;
      /** This is as low as the stall goes: more counters won't move it. */
      final?: boolean;
    }
  | { type: "deal"; offer: Offer; payee: Payee; note: string }
  | { type: "no-offer"; reason: string }
  /** The stall's welcome, with its menu at asking prices. `said`: in each language asked for. */
  | {
      type: "welcome";
      note: string;
      menu: { name: string; aliases: string[]; priceInr: number }[];
      said?: Record<string, string>;
    };

export const newId = () => crypto.randomUUID();

export function userMessage(
  intent: BuyerIntent,
  extension: string,
  task?: { taskId?: string; contextId?: string },
): Message {
  return {
    messageId: newId(),
    role: "ROLE_USER",
    parts: [{ data: intent, mediaType: "application/json" }],
    extensions: [extension],
    ...task,
  };
}

export function agentMessage(
  reply: unknown,
  extension: string,
  task?: { taskId: string; contextId: string },
): Message {
  return {
    messageId: newId(),
    role: "ROLE_AGENT",
    parts: [{ data: reply, mediaType: "application/json" }],
    extensions: [extension],
    ...task,
  };
}

/** The first data part of a message, or undefined. */
export const dataOf = <T>(m: Message | undefined) =>
  m?.parts?.find((p) => p?.data !== undefined)?.data as T | undefined;

/** Canonical JSON (sorted keys, no spaces) of an offer without its signature: what gets signed. */
export function canonicalOffer(offer: Omit<Offer, "sig"> | Offer): string {
  const rest: Record<string, unknown> = { ...offer };
  delete rest.sig;
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(rest));
}
