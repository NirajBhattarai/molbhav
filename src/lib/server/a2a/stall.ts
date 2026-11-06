import "server-only";
import {
  A2A_VERSION,
  RPC,
  TERMINAL,
  agentMessage,
  dataOf,
  newId,
  type BuyerIntent,
  type Message,
  type Offer,
  type StallReply,
  type Task,
  type TaskState,
} from "@/lib/a2a/protocol";
import { extensionUri } from "@/lib/a2a/extensions";
import { agentKeys, signOffer, verifyOffer, type InternalRole } from "@/lib/server/a2a/keys";
import { loadTask, saveTask } from "@/lib/server/a2a/tasks";
import { query, transaction } from "@/lib/server/db";
import { redis, redisConfigured } from "@/lib/server/redis";
import {
  stallThinks,
  stallWelcomes,
  type Speak,
  type Spoken,
  type Turn,
} from "@/lib/server/ai-agent";
import { decideStallCounter, stallLeast, stallSettles } from "@/lib/server/stall-agent";
import { MAX_COUNTERS, type Style } from "@/lib/server/strategy";
import { LANG, isLang, type Lang } from "@/lib/languages";
import { upiPayLink } from "@/lib/upi";
import { rupees, words as wantWords } from "@/lib/want";
import { basketBand, type BasketBand } from "@/lib/market";
import { areaPrice } from "@/lib/server/market";

/*
 * One stall agent answering one buyer's agent over A2A, one message at a time:
 *   rfq {basket}                    → signed offer at the asking price
 *   counter {targetInr, competing?} → a better signed offer, never below the lowest
 *   accept {offerId}                → the deal + UPI payee
 *   decline                         → canceled
 * Pricing rules: stall-agent.ts. Gemini (ai-agent.ts) picks wording + a price inside the
 * allowed range; on miss, catalog-style notes + decideStallCounter.
 *
 * Stall body cache (cache-aside; Postgres stays source of truth):
 *   read   Redis → miss → Postgres → fill Redis (AGENT_TTL)
 *   write  shop/sign updates call forgetOwnerAgent so the next read refills
 *   agent:{agentId}         StallAgent JSON (menu + floors, server only)   10 min
 *   owner-agent:{ownerId}   that owner's agent id, "-" for none            1 day
 *                           (only saveShop changes it: ownerAgentMoved)
 */

export const OFFER_TTL_MS = 10 * 60_000;
export const AGENT_ID = /^agent_[0-9a-f]{10}$/;

const AGENT_TTL = 600;
const agentKey = (id: string) => `agent:${id}`;
const OWNER_TTL = 24 * 60 * 60;
const ownerKey = (ownerId: string) => `owner-agent:${ownerId}`;

/** Drop cached stall agents so the next read refills from Postgres. Safe if Redis is down. */
export async function forgetAgents(...agentIds: (string | null | undefined)[]) {
  if (!redisConfigured()) return;
  const keys = [
    ...new Set(agentIds.filter((id): id is string => !!id && AGENT_ID.test(id)).map(agentKey)),
  ];
  if (!keys.length) return;
  try {
    await (await redis()).del(keys);
  } catch {
    /* ignore */
  }
}

/** Remembers which agent an owner's stall is; null when it has none yet. Safe if Redis is down. */
async function rememberOwnerAgent(ownerId: string, agentId: string | null) {
  try {
    await (await redis()).set(ownerKey(ownerId), agentId ?? "-", { EX: OWNER_TTL });
  } catch {
    /* ignore */
  }
}

/**
 * The owner's agent id, for cache bookkeeping: from Redis, else Postgres (then remembered). Null
 * when it has none, or without Redis (there's no cache to keep then, so no query either).
 */
export async function ownerAgentId(ownerId: string): Promise<string | null> {
  if (!redisConfigured()) return null;
  try {
    const hit = await (await redis()).get(ownerKey(ownerId));
    if (hit !== null) return hit === "-" ? null : hit;
  } catch {
    /* fall through to Postgres */
  }
  const [row] = await query<{ agent_id: string | null }>(
    "SELECT agent_id FROM stalls WHERE owner_id = $1",
    [ownerId],
  ).catch(() => [] as { agent_id: string | null }[]);
  const id = row?.agent_id ?? null;
  // Only remember a real answer: a failed query mustn't stick as "no agent" for a day.
  if (row) await rememberOwnerAgent(ownerId, id);
  return id;
}

/** After a shop/sign write: drop that owner's cached agent body. */
export async function forgetOwnerAgent(ownerId: string) {
  if (!redisConfigured()) return;
  await forgetAgents(await ownerAgentId(ownerId));
}

/**
 * After saveShop: a new UPI makes a new agent id. Remember the new one, and drop both cached
 * bodies, so the old id stops answering at once.
 */
export async function ownerAgentMoved(ownerId: string, before: string | null, now: string | null) {
  if (!redisConfigured()) return;
  await rememberOwnerAgent(ownerId, now);
  await forgetAgents(before, now);
}

export type StallAgentItem = {
  id: number;
  name: string;
  words: string;
  price: number;
  lowest: number;
};

export type StallAgent = {
  stallId: string;
  agentId: string;
  name: string;
  upi: string;
  qr: string | null;
  style: Style;
  lang: Lang;
  open: boolean;
  lat: number | null;
  lng: number | null;
  items: StallAgentItem[];
};

export type Negotiation = {
  lines: { itemId: number; name: string; asked: string; qty: number; unit: number }[];
  ask: number;
  floor: number;
  asking: number;
  counters: number;
  lastOffer: Offer | null;
  turns: { from: "buyer" | "stall"; amount: number; text: string }[];
  missing?: string[];
  /** What this basket usually costs around the stall, looked up once at the rfq. */
  market?: BasketBand | null;
};

export type Stored = { task: Task; state: Negotiation | null };

export class A2aError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly metadata?: Record<string, string>,
  ) {
    super(message);
  }
}

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

function matchItem(items: StallAgentItem[], want: Set<string>): StallAgentItem | null {
  let best: StallAgentItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = [...wantWords(`${item.name} ${item.words}`)].filter((w) => want.has(w)).length;
    if (score > bestScore) [best, bestScore] = [item, score];
  }
  return best;
}

/**
 * The basket's usual price around the stall, from its own item names (they match other stalls'
 * menus better than the buyer's words). Null without a location, or when the lookup fails:
 * bargaining goes on without it.
 */
async function marketFor(
  agent: StallAgent,
  lines: Negotiation["lines"],
): Promise<BasketBand | null> {
  if (agent.lat === null || agent.lng === null) return null;
  try {
    const prices = await Promise.all(lines.map((l) => areaPrice(l.name, agent.lat!, agent.lng!)));
    return basketBand(lines.map((l, i) => ({ qty: l.qty, price: prices[i] })));
  } catch (e) {
    console.warn("market", (e as Error).message);
    return null;
  }
}

/**
 * Gemini bargains only when the stall knows the usual price nearby. Without one it has nothing to
 * judge offers by, so the stall starts at its asking price and code alone concedes, with plain notes.
 */
const aiFor = <T>(s: Pick<Negotiation, "market">, think: () => Promise<T | null>) =>
  s.market ? think() : Promise.resolve(null);

const basketKey = (lines: { item: string; qty: number }[]) =>
  lines
    .map((l) => `${l.item.trim().toLowerCase()}×${l.qty}`)
    .sort()
    .join("|");

const saidIn = (message: Message) =>
  message.parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join(" ")
    .trim()
    .slice(0, 300);

const menuLines = (menu: { name: string; priceInr: number }[]) =>
  menu
    .slice(0, 8)
    .map((m) => `• ${m.name}: ${rupees(m.priceInr)}`)
    .join("\n");

/**
 * A stall's answer to a counter-offer. Code sets how far it may come down this round; Gemini picks
 * inside that and never sees the lowest. Without AI it comes down as far as it may (`words` null).
 */
export async function stallCounter(
  stall: { name: string; style: Style },
  s: {
    items: string;
    ask: number;
    asking: number;
    floor: number;
    counters: number;
    turns: Turn[];
    lastTarget?: number;
    market?: BasketBand | null;
  },
  target: number,
  opts: { beat?: number; said?: string; speak?: Speak; ai?: boolean } = {},
): Promise<{ next: number; words: Spoken | null }> {
  const { beat } = opts;
  const counter = {
    ask: s.ask,
    asking: s.asking,
    floor: s.floor,
    counters: s.counters,
    lastTarget: s.lastTarget,
    style: stall.style,
    target,
    beat,
  };
  if (opts.ai === false) return { next: decideStallCounter(counter).totalInr, words: null };
  const least = stallLeast(counter);
  const thought = await stallThinks(
    stall,
    {
      items: s.items,
      asking: s.asking,
      offer: target,
      least,
      rival: beat,
      round: s.counters + 1,
      rounds: MAX_COUNTERS,
      turns: s.turns,
      said: opts.said,
      market: s.market,
    },
    opts.speak,
  );
  if (thought) {
    const wanted =
      thought.move === "hold"
        ? s.asking
        : thought.move === "accept" && target >= least
          ? target
          : thought.amount;
    const next = Math.max(least, target, Math.min(s.asking, wanted));
    return { next, words: thought.amount === next ? thought : null };
  }
  return { next: decideStallCounter(counter).totalInr, words: null };
}

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
          "rfq {basket:[{item,qty}]} → signed offer; counter {targetInr, competing?} → better offer; " +
          "accept {offerId} → deal with UPI; decline.",
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

async function stallAgentFromDb(agentId: string): Promise<StallAgent | null> {
  const rows = await query<{
    id: string;
    agent_id: string;
    name: string;
    upi_id: string;
    upi_qr: string | null;
    style: Style;
    lang: Lang;
    is_open: boolean;
    lat: number | null;
    lng: number | null;
    items: StallAgentItem[];
  }>(
    `SELECT s.id, s.agent_id, s.name, s.upi_id, s.upi_qr, s.style, s.lang, s.is_open, s.lat, s.lng,
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
    upi: r.upi_id,
    qr: r.upi_qr,
    style: r.style,
    lang: r.lang,
    open: r.is_open && r.lat !== null,
    lat: r.lat,
    lng: r.lng,
    items: r.items,
  };
}

/**
 * The stall behind an agent id, with its menu. Redis first; on a miss Postgres, then cache.
 * A closed stall still returns a card that says closed.
 */
export async function stallAgent(agentId: string): Promise<StallAgent | null> {
  if (!AGENT_ID.test(agentId)) return null;
  if (redisConfigured()) {
    try {
      const raw = await (await redis()).get(agentKey(agentId));
      if (raw) return JSON.parse(raw) as StallAgent;
    } catch {
      /* fall through */
    }
  }
  const agent = await stallAgentFromDb(agentId);
  if (agent && redisConfigured()) {
    await (
      await redis()
    )
      .set(agentKey(agent.agentId), JSON.stringify(agent), { EX: AGENT_TTL })
      .catch(() => {});
  }
  return agent;
}

function signedOffer(agent: StallAgent, s: Negotiation, total: number) {
  return signOffer(
    {
      offerId: newId(),
      agentId: agent.agentId,
      stallName: agent.name,
      lines: s.lines.map((l) => ({
        item: l.asked,
        name: l.name,
        qty: l.qty,
        unitInr: Math.round(((l.unit * total) / s.ask) * 100) / 100,
      })),
      totalInr: total,
      round: s.counters,
      validUntil: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
    },
    agentKeys(agent.agentId).privateKey,
  );
}

export async function handleBuyerMessage(
  agent: StallAgent,
  base: string,
  message: Message,
  prior: Stored | undefined,
): Promise<Stored> {
  const ext = extensionUri(base, "bargain");
  const intent = dataOf<BuyerIntent>(message);
  if (!intent || typeof intent !== "object" || !("type" in intent)) {
    throw new A2aError(
      RPC.invalidParams,
      "the message needs a data part with an intent: rfq, counter, accept or decline",
    );
  }
  if (prior && TERMINAL.includes(prior.task.status.state)) {
    throw new A2aError(
      RPC.unsupportedOperation,
      `this negotiation is already ${prior.task.status.state}`,
    );
  }
  if (!prior && intent.type !== "rfq" && intent.type !== "hello")
    throw new A2aError(RPC.invalidParams, "start a negotiation with an rfq or a hello");

  // Languages the buyer's agent asked for: the stall's AI says its line in each (English first).
  const asked = "languages" in intent && Array.isArray(intent.languages) ? intent.languages : [];
  const codes = [...new Set<Lang>(["en", ...asked.filter(isLang)])];
  const speak: Speak | undefined =
    codes.length > 1 ? codes.map((code) => ({ code, name: LANG[code].english })) : undefined;
  const said = saidIn(message);

  const taskId = prior?.task.id ?? newId();
  const contextId = prior?.task.contextId ?? message.contextId ?? newId();
  const history = [...(prior?.task.history ?? []), { ...message, taskId, contextId }];

  const reply = (
    state: TaskState,
    r: StallReply,
    s: Negotiation | null,
    artifact?: unknown,
  ): Stored => {
    const out = agentMessage(r, ext, { taskId, contextId });
    return {
      state: s,
      task: {
        id: taskId,
        contextId,
        status: { state, message: out, timestamp: new Date().toISOString() },
        history: [...history, out],
        ...(artifact
          ? {
              artifacts: [
                {
                  artifactId: newId(),
                  name: "deal",
                  parts: [{ data: artifact, mediaType: "application/json" }],
                },
              ],
            }
          : {}),
      },
    };
  };

  const issue = (
    s: Negotiation,
    total: number,
    note: string,
    voiced?: Record<string, string>,
    final = false,
  ): Stored => {
    const offer = signedOffer(agent, s, total);
    return reply(
      "TASK_STATE_INPUT_REQUIRED",
      {
        type: "offer",
        offer,
        note,
        ...(s.missing?.length ? { missing: s.missing } : {}),
        ...(voiced && { said: voiced }),
        ...(final && { final }),
      },
      {
        ...s,
        asking: total,
        lastOffer: offer,
        turns: [...s.turns, { from: "stall", amount: total, text: note }],
      },
    );
  };

  if ((intent.type === "rfq" || intent.type === "hello") && !agent.open) {
    return reply(
      "TASK_STATE_REJECTED",
      { type: "no-offer", reason: `${agent.name} isn't taking orders right now` },
      null,
    );
  }

  // The stall speaks first: its AI's welcome, then its menu. Nothing is offered yet.
  if (intent.type === "hello") {
    const menu = menuOf(agent);
    const list = menuLines(menu);
    const words = await stallWelcomes(agent, speak);
    const withMenu = (welcome: string) => `${welcome}\n\n${list}`;
    return reply(
      "TASK_STATE_INPUT_REQUIRED",
      {
        type: "welcome",
        menu,
        note: withMenu(words?.line ?? `Welcome to ${agent.name}! Here's what we have today:`),
        ...(words?.said && {
          said: Object.fromEntries(
            Object.entries(words.said).map(([code, line]) => [code, withMenu(line)]),
          ),
        }),
      },
      null,
    );
  }

  if (intent.type === "rfq") {
    const basket = Array.isArray(intent.basket) ? intent.basket.slice(0, 20) : [];
    if (!basket.length) throw new A2aError(RPC.invalidParams, "rfq needs a basket: [{item, qty}]");
    const lines: Negotiation["lines"] = [];
    const missing: string[] = [];
    for (const b of basket) {
      const itemAsked = String(b?.item ?? "")
        .trim()
        .slice(0, 60);
      const qty = Math.max(1, Math.min(99, Math.floor(Number(b?.qty) || 1)));
      const item = matchItem(agent.items, wantWords(itemAsked));
      if (item)
        lines.push({ itemId: item.id, name: item.name, asked: itemAsked, qty, unit: item.price });
      else missing.push(itemAsked);
    }
    if (!lines.length) {
      return reply(
        "TASK_STATE_REJECTED",
        { type: "no-offer", reason: `${agent.name} doesn't sell ${missing.join(", ")}` },
        null,
      );
    }
    const ask = lines.reduce((t, l) => t + l.unit * l.qty, 0);
    const floor = lines.reduce(
      (t, l) => t + agent.items.find((i) => i.id === l.itemId)!.lowest * l.qty,
      0,
    );
    const s: Negotiation = {
      lines,
      ask,
      floor,
      asking: ask,
      counters: 0,
      lastOffer: null,
      turns: [],
      missing,
      market: await marketFor(agent, lines),
    };
    const what = lines.map((l) => `${l.qty} × ${l.name}`).join(", ");
    // The stall's AI greets them and names its ask; else a plain quote. Without a usual price
    // nearby the AI has nothing to judge by, so code does all the bargaining (see `aiFor`).
    const hello = await aiFor(s, () =>
      stallThinks(
        agent,
        {
          items: what,
          asking: ask,
          least: ask,
          round: 0,
          rounds: MAX_COUNTERS,
          turns: [],
          said,
          greeted: prior !== undefined,
          market: s.market,
        },
        speak,
      ),
    );
    return hello?.amount === ask
      ? issue(s, ask, hello.line, hello.said)
      : issue(s, ask, `${what}: ${rupees(ask)}.`);
  }

  const s = prior?.state;
  if (!s?.lastOffer) throw new A2aError(RPC.invalidParams, "no open offer on this task");

  if (intent.type === "decline") {
    return reply(
      "TASK_STATE_CANCELED",
      { type: "no-offer", reason: "the buyer went elsewhere" },
      s,
    );
  }

  if (intent.type === "accept") {
    const offer = s.lastOffer;
    if (intent.offerId !== offer.offerId)
      throw new A2aError(RPC.invalidParams, "that offer was replaced; accept the latest one");
    if (Date.parse(offer.validUntil) < Date.now())
      throw new A2aError(RPC.invalidParams, "that offer has expired; send a new rfq");
    const payee = {
      vpa: agent.upi,
      name: agent.name,
      upiLink: upiPayLink(
        { vpa: agent.upi, name: agent.name, qr: agent.qr ?? undefined },
        offer.totalInr,
        "Molbhav",
      ),
    };
    const note = `Deal at ${rupees(offer.totalInr)}.`;
    return reply(
      "TASK_STATE_COMPLETED",
      { type: "deal", offer, payee, note },
      { ...s, turns: [...s.turns, { from: "buyer", amount: offer.totalInr, text: note }] },
      { offer, payee },
    );
  }

  if (intent.type === "counter") {
    const target = Math.round(Number(intent.targetInr));
    if (!Number.isFinite(target) || target <= 0)
      throw new A2aError(RPC.invalidParams, "counter needs a positive targetInr");
    const base: Negotiation = {
      ...s,
      counters: s.counters + 1,
      turns: [
        ...s.turns,
        { from: "buyer", amount: target, text: said || `Can you do ${rupees(target)}?` },
      ],
    };

    const items = s.lines.map((l) => `${l.qty} × ${l.name}`).join(", ");
    // The buyer's last offer: taken if it clears the lowest, else the stall names its final price.
    const settled = stallSettles({
      asking: s.asking,
      floor: s.floor,
      counters: s.counters,
      target,
      final: intent.final,
    });
    if (settled && intent.final) {
      const price = settled.totalInr;
      const last = await aiFor(s, () =>
        stallThinks(
          agent,
          {
            items,
            asking: s.asking,
            offer: target,
            least: price,
            round: MAX_COUNTERS,
            rounds: MAX_COUNTERS,
            turns: base.turns,
            said,
            market: s.market,
          },
          speak,
        ),
      );
      const held = price !== target;
      return last?.amount === price
        ? issue(base, price, last.line, last.said, held)
        : issue(
            base,
            price,
            held ? `${rupees(price)} is my final price.` : `Okay, ${rupees(price)}.`,
            undefined,
            held,
          );
    }
    if (settled?.final)
      return issue(
        base,
        settled.totalInr,
        `${rupees(settled.totalInr)} is my final price.`,
        undefined,
        true,
      );
    if (settled) return issue(base, settled.totalInr, `${rupees(settled.totalInr)} it is.`);

    // A rival's offer counts only if it's genuine, unexpired, for the same basket, from another stall.
    let beat: number | undefined;
    const rival = intent.competing;
    if (
      rival &&
      rival.agentId !== agent.agentId &&
      Date.parse(rival.validUntil) >= Date.now() &&
      basketKey(rival.lines ?? []) ===
        basketKey(s.lines.map((l) => ({ item: l.asked, qty: l.qty })))
    ) {
      const other = await stallAgent(String(rival.agentId));
      if (other && verifyOffer(rival, agentKeys(other.agentId).publicKey)) beat = rival.totalInr;
    }

    const { next, words } = await stallCounter(
      agent,
      {
        items,
        ask: s.ask,
        asking: s.asking,
        floor: s.floor,
        counters: s.counters,
        turns: base.turns,
        lastTarget: s.turns.findLast((t) => t.from === "buyer")?.amount,
        market: s.market,
      },
      target,
      { beat, said, speak, ai: Boolean(s.market) },
    );
    const note =
      words?.line ??
      (next === target
        ? `Okay, ${rupees(next)}.`
        : next === s.floor || next === s.asking
          ? `${rupees(next)} is as low as I go.`
          : beat !== undefined && next < beat
            ? `I'll beat the other stall: ${rupees(next)}.`
            : `I can do ${rupees(next)}.`);
    return issue(base, next, note, words?.said, next === s.floor);
  }

  throw new A2aError(RPC.invalidParams, `unknown intent ${(intent as { type: string }).type}`);
}

export async function stallTurn(
  agent: StallAgent,
  base: string,
  message: Message,
  from: InternalRole | null = null,
): Promise<Stored> {
  const prior = await loadTask(agent.stallId, message.taskId);
  if (message.taskId && !prior) {
    throw new A2aError(RPC.taskNotFound, `no task ${message.taskId} at this agent`, {
      taskId: String(message.taskId),
    });
  }
  const next = await handleBuyerMessage(agent, base, message, prior);
  await saveTask(agent.stallId, next);
  if (from !== "app" && next.task.status.state === "TASK_STATE_COMPLETED" && next.state?.lastOffer)
    await recordDeal(agent, next.state, next.state.lastOffer.totalInr);
  return next;
}

/** Outside-agent deal → shop bargains list (no Molbhav buyer). */
export async function recordDeal(agent: StallAgent, s: Negotiation, final: number) {
  const id = crypto.randomUUID();
  const order = s.lines.map((l) => `${l.qty} × ${l.name}`).join(", ");
  const n = s.turns.length;
  await transaction([
    {
      text: `INSERT INTO bargains (id, buyer_id, want, title, budget, buyer_lang, source)
             VALUES ($1, NULL, $2, $2, NULL, 'en', 'a2a')`,
      params: [id, order],
    },
    {
      text: `INSERT INTO offers (bargain_id, stall_id, item_id, status, asked, current, agent_offer)
             VALUES ($1, $2, $3, 'agreed', $4, $5, $5)`,
      params: [id, agent.stallId, s.lines[0].itemId, s.ask, final],
    },
    ...s.turns.map((t, i) => ({
      text: `INSERT INTO turns (bargain_id, stall_id, speaker, text, vars, status, current, at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(secs => $8))`,
      params: [
        id,
        agent.stallId,
        t.from === "stall" ? "stall" : "agent",
        t.text,
        t.from === "buyer" ? JSON.stringify({ price: rupees(t.amount) }) : null,
        i === n - 1 ? "agreed" : "haggling",
        t.from === "stall" ? t.amount : null,
        n - i,
      ],
    })),
  ]);
}
