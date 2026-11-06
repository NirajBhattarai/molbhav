# ENS names for stall agents (ENSv2)

Every stall agent is a namespace under the market's name on ENSv2 (Sepolia):
`mohd-soyeb-khan.molbhav.eth`. A buyer's agent that knows only the name can find the stall's A2A
Agent Card, bargain with it, and know where to pay it.

## What a stall agent's name holds

| Record                 | Value                                                            | Standard |
| ---------------------- | ---------------------------------------------------------------- | -------- |
| `agent-endpoint[a2a]`  | The stall agent's Agent Card URL                                 | ENSIP-26 |
| `agent-context`        | JSON: kind, agent id, stall name, protocol, card, how to bargain | ENSIP-26 |
| `description`, `url`   | A line about the stall; the market's site                        |          |
| address, any EVM chain | The shop owner's wallet (`0x80000000`)                           | ENSIP-11 |
| address, Hedera (296)  | The shop owner's wallet, where buyer agents pay                  | ENSIP-11 |

The Agent Card names it back (`ens` in the bargain extension's params), so a client checks both
directions before trusting a name. The app's own buyer agent finds stalls this way
(`findStall` in `src/lib/server/negotiate.ts`) and falls back to the agent id.

## How it's built (ENSv2 features)

- **Subname registry:** `molbhav.eth` has its own `UserRegistry`. Each stall agent's name is a token
  in it, owned by the shop owner's wallet (from their Magic `did:ethr` id).
- **A resolver per name:** each name gets its own `PermissionedResolver`, born with its records
  (deployed through the `VerifiableFactory`, records set in `initialize`). Rights granted on it
  therefore cover that one name only.
- **Enhanced Access Control:**
  - The market's registrar wallet holds every role, and keeps the records honest.
  - The shop owner's wallet may change only its `description` and its Hedera payout address
    (`grantSetterRoles`), on its own name.
  - The owner's token carries only `ROLE_RENEW`: it can't repoint the resolver or transfer the
    name, so the market can always vouch for what the name says.

## Flow

1. `npm run ens:wallet`: makes the registrar wallet, saved to `.env.local` as `ENS_REGISTRAR_KEY`.
   Fund it with Sepolia ETH.
2. `npm run ens:setup`: registers `molbhav.eth` with ETHRegistrar (commit, wait, register; paid in
   MockUSDC, which it mints), with the market's own registry and resolver. Add the printed
   `ENS_*` lines to `.env.local` and Vercel.
3. From then on `syncStallName` (`src/lib/server/ens.ts`) runs after a shop is saved, or when the
   shop screen opens without a live name:
   label → its resolver (with records) → the subname → owner's rights → `live`.
   Each step is saved in `stalls.ens_status`, so a run cut short picks up where it stopped. A new
   stall name or UPI rewrites the records in one multicall.

Contracts: [ENS deployments](https://docs.ens.domains/learn/deployments/) (ENSv2 Sepolia).
