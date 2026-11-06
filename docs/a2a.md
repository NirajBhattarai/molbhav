# Stall agents and Agent Cards (A2A)

MolBhav exposes each published stall as an [A2A](https://a2a-protocol.org/latest/specification/)
agent. Discovery follows the protocol’s
[agent discovery](https://a2a-protocol.org/latest/topics/agent-discovery/) topic: a JSON
**Agent Card** at a well-known URL describes who the agent is, where to talk to it, and what it can do.

This repo ships **stall agents**: public Agent Cards plus JSON-RPC bargaining
(`rfq` / `counter` / `accept` / `decline`) at the stall endpoint. No market directory yet — the buyer
agent finds stalls via BLE / GPS / direct card URL.

## How a stall becomes an agent

When a shopkeeper saves a UPI ID, Postgres sets:

```text
agent_id = 'agent_' || left(encode(sha256(upi_id), 'hex'), 10)
```

That `agent_id` is the stall’s address for other AI agents (also shown on the shop screen).

A stall is **published** for a card when it has:

- `agent_id` (UPI set)
- non-empty `name`
- at least one active menu item

Closed stalls still return a card; `params.status` is `"closed"`.

## Card URL

```text
GET /a2a/agents/{agentId}/.well-known/agent-card.json
```

Example (local):

```sh
curl -s http://localhost:3000/a2a/agents/agent_0123456789/.well-known/agent-card.json | jq .
```

The shop UI links this path via `stallAgentCardPath` in
`src/components/app/agent-address.tsx`.

Cards are public (no session). Responses are cacheable (`Cache-Control`, `ETag`) per A2A caching
guidance.

## What’s in the card

Top-level fields follow the A2A `AgentCard` shape (`name`, `description`, `version`,
`supportedInterfaces`, `capabilities`, `skills`, …). Molbhav-only data sits in the **bargain**
extension’s `params` (never lowest price, owner, or UPI):

| `params` field | Meaning                                       |
| -------------- | --------------------------------------------- |
| `agentId`      | Same as the path id                           |
| `status`       | `open` or `closed`                            |
| `style`        | `friendly` or `firm`                          |
| `lang`         | Stall language code                           |
| `offerKey`     | Ed25519 JWK (`OKP`) to verify signed offers   |
| `menu`         | `[{ name, aliases, priceInr }]` asking prices |

Extension URI (also the Markdown spec):

```text
GET /a2a/extensions/bargain/v1
```

Code:

| Piece                          | Where                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Load stall + build card        | `src/lib/server/a2a/stall.ts` (Redis `agent:{id}`, 10 min; invalidate on shop/sign write) |
| JSON-RPC                       | `src/lib/server/a2a/rpc/` (`stallRpc`, `readRpc`, `handleStallSend`, `handleTaskMethod`)  |
| Offer signing key (public `x`) | `src/lib/server/a2a/keys.ts`                                                              |
| HTTP helpers (CORS, ETag)      | `src/lib/server/a2a/http.ts`                                                              |
| Card route                     | `src/app/a2a/agents/[id]/.well-known/…`                                                   |
| Extension docs                 | `src/app/a2a/extensions/[name]/v1`                                                        |

## Endpoint (bargaining)

```text
POST /a2a/agents/{agentId}
```

JSON-RPC 2.0 with headers `A2A-Version: 1.0` and `A2A-Extensions: {origin}/a2a/extensions/bargain/v1`.

| Method                                       | Role                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `SendMessage` / `SendStreamingMessage`       | `hello` / `rfq` / `counter` / `accept` / `decline` |
| `GetTask` / `SubscribeToTask` / `CancelTask` | Follow or cancel the task                          |

Pricing rules live in `src/lib/server/stall-agent.ts`. Gemini wording (and a price pick
inside the allowed range) is `src/lib/server/ai-agent.ts`; without Gemini the stall falls
back to catalog notes. Accepted outside deals are stored as `bargains.source = 'a2a'` for
the shop screen.

## Spec references

- [A2A specification](https://a2a-protocol.org/latest/specification/) — `AgentCard`, capabilities, skills
- [Agent discovery](https://a2a-protocol.org/latest/topics/agent-discovery/) — well-known Agent Card
- [Extensions](https://a2a-protocol.org/latest/topics/extensions/) — `capabilities.extensions` + `A2A-Extensions`

## Not in this slice

- Market directory card / `find` / catalog
- Buyer agent as an A2A client / buyer Gemini (app still uses local `seedHaggle`)
