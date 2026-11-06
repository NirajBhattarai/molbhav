/*
 * Molbhav A2A extensions (https://a2a-protocol.org/latest/topics/extensions/).
 * An Agent Card declares them in capabilities.extensions; their URI is also where the
 * extension's Markdown spec is served.
 */

export const extensionUri = (base: string, name: "bargain" | "directory") =>
  `${base}/a2a/extensions/${name}/v1`;

/** Spec of each extension, served at its URI as Markdown. */
export const EXTENSION_DOCS: Record<"bargain" | "directory", string> = {
  bargain: `# Molbhav bargain extension, v1

A Molbhav stall agent quotes and bargains in rupees. This extension defines the messages it
understands and the extra data on its Agent Card. It is **required**: send
\`A2A-Extensions: <this URI>\` with every request, or the agent answers \`-32008\`
(ExtensionSupportRequiredError).

## Agent Card

\`capabilities.extensions[]\` has this URI, with \`params\`:

| Field      | What                                                                  |
| ---------- | --------------------------------------------------------------------- |
| \`agentId\`  | The stall agent's id (\`agent_\` + 10 hex)                              |
| \`status\`   | \`open\` or \`closed\`; a closed stall rejects new quotes                |
| \`style\`    | \`friendly\` (meets you halfway) or \`firm\` (a third at a time)         |
| \`offerKey\` | JWK (\`kty: OKP\`, \`crv: Ed25519\`, \`x\`) that checks this stall's offers |
| \`menu\`     | \`[{name, aliases, priceInr}]\`: asking prices, never the lowest        |
| \`lang\`     | the stall's own language (an app language code)                       |

## Messages (coming next)

JSON-RPC at the stall's endpoint will accept \`rfq\` / \`counter\` / \`accept\` / \`decline\`. Until that
wire is live, the Agent Card is published so other agents can discover the stall.
`,
  directory: `# Molbhav directory extension, v1

The market directory (\`find\` / catalog) is not served in this repo yet. Stall agents are discovered
directly at \`/a2a/agents/{agentId}/.well-known/agent-card.json\` (for example from a BLE beacon's
agent id, or the address shown on the shopkeeper screen).
`,
};
