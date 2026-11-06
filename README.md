# MolBhav

**MolBhav** (मोलभाउ, "haggling") brings the bargaining of a street market to AI agents. A **customer
agent** haggles with a **stall agent** for you, the way you would at a market stall. Each stall agent
has an **ENS name**, broadcasts it from a **Bluetooth sign** at the stall, and gets paid in **HBAR on
Hedera over x402** when a deal is agreed.

Live: [molbhav-eta.vercel.app](https://molbhav-eta.vercel.app)

## How it works

```
 Buyer ──▶ Customer agent ⇄ rfq / counter / accept (A2A) ⇄ Stall agent ◀── Stall owner
              │   ▲                                            │
     hears    │   └── mohd-soyeb-khan.molbhav.eth (ENS) ───────┘  Agent Card, where to pay
     the sign │
              ▼
        Deal agreed ──▶ Pay 12.67 HBAR (x402) ──▶ facilitator settles on Hedera ──▶ stall's account
```

1. **Find:** the buyer's agent finds stalls nearby, from their Bluetooth signs or the buyer's location.
2. **Bargain:** the two agents trade offers over [A2A](https://a2a-protocol.org) (`rfq`, `counter`,
   `accept`, `decline`) until they agree a price or one side walks away. The customer agent knows
   your budget; the stall agent knows its asking price and its floor.
3. **Pay:** the buyer taps **Pay … HBAR**. Their Magic wallet signs the transfer, an x402 facilitator
   pays the network fee and settles it, and the chat links the transaction on HashScan. "I've paid
   another way" stays for cash and UPI.

## The pieces

| Piece                    | What it does                                                                                                                                                                                                                                                                                                 | Docs                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Stall agents (A2A)**   | Every published stall is an A2A agent with a public Agent Card and a JSON-RPC bargaining endpoint.                                                                                                                                                                                                           | [docs/a2a.md](docs/a2a.md)                                     |
| **ENS names (ENSv2)**    | Each stall agent gets `<label>.molbhav.eth` on Sepolia, holding its Agent Card URL (ENSIP-26), its context, and the owner's addresses, Hedera included (ENSIP-11). An agent that knows only the name can find the stall, bargain with it and know where to pay it. A new shop gets one when it is published. | [docs/ens.md](docs/ens.md)                                     |
| **Bluetooth stall sign** | An ESP32 at the stall advertises its agent id (company `0x0BAB`) and its ENS label (`mohd-soyeb-khan`) as the local name. The iPhone app adds `.molbhav.eth` and asks those stalls first.                                                                                                                    | [firmware/stall-sign/BEACON.md](firmware/stall-sign/BEACON.md) |
| **x402 payments**        | Each agreed deal is an x402 resource (`exact` scheme, `hedera:testnet`). It answers 402 with the price in HBAR, paid to the Hedera address on the stall's ENS name. The facilitator verifies, pays the fee and settles.                                                                                      | [docs/x402.md](docs/x402.md)                                   |
| **Deal log (HCS)**       | Every agreed and paid deal is posted as JSON to a Hedera Consensus Service topic only the market can write to: stall, ENS name, item, price and the x402 transaction. No buyer identity. The chat links it on HashScan.                                                                                      | [docs/hcs.md](docs/hcs.md)                                     |
| **Wallet**               | Sign-in is an email code via Magic, which gives every user a Hedera wallet. The profile shows the account that pays (`0.0.x`) and its HBAR balance. Molbhav never sees keys.                                                                                                                                 | [docs/x402.md](docs/x402.md#setup)                             |
| **iPhone app**           | A Capacitor shell around the web app that adds Bluetooth scanning.                                                                                                                                                                                                                                           | [docs/mobile.md](docs/mobile.md)                               |

## Finding stalls

Buyers choose how their agent finds stalls, in Profile:

1. **Nearby agents (default):** the iPhone app scans for stall signs. It reads each sign's agent id
   from the advertisement and its ENS name from the scan response, and shows the names it hears as
   chips. Open signs it hears are asked first, with no market search.
2. **Location:** open stalls near the buyer's pin, when they share it.

## Paying a deal (testnet)

1. Open **Profile → Wallet** and copy your Hedera account (`0.0.x`).
2. Get free testnet HBAR from [portal.hedera.com/faucet](https://portal.hedera.com/faucet).
3. Agree a price in a chat and tap **Pay … HBAR**. The price in rupees is converted at
   `X402_INR_PER_HBAR` (default ₹15 per HBAR) and rounded up for the stall.

Fund the `0.0.x` account the profile shows. HBAR sent to your EVM address (`0x…`) can't be spent by
the pay button.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) and TypeScript, Tailwind CSS
- Postgres on Neon, Redis on Vercel (Redis Cloud)
- Gemini for the agents' bargaining
- Magic (email sign-in, Hedera wallet), `@hiero-ledger/sdk`
- Hedera Consensus Service for the deal log
- x402: `@x402/core`, `@x402/hedera`, facilitator [x402.org](https://x402.org/facilitator)
- ENSv2 on Sepolia with `viem`
- Capacitor (iPhone), ESP32 with NimBLE and PlatformIO (stall sign)
- Vitest and Testing Library

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Shopkeepers: sign in, choose **I run a stall**,
then go to `/shop`.

### Environment

| Env                                                              | Needed for                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `DATABASE_URL`, `SESSION_SECRET`                                 | Everything                                            |
| `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY`, `MAGIC_SECRET_KEY`          | Sign-in and the Hedera wallet                         |
| `NEXT_PUBLIC_HEDERA_NETWORK`                                     | `testnet` (default) or `mainnet`                      |
| `GEMINI_API_KEY`                                                 | The bargaining agents                                 |
| `REDIS_URL`                                                      | Caches and locks (optional, but use it in production) |
| `ENS_REGISTRAR_KEY`, `ENS_REGISTRY`, `ENS_PARENT`                | ENS names for stalls (optional)                       |
| `X402_FACILITATOR_URL`, `X402_INR_PER_HBAR`                      | x402 payments (defaults work on testnet)              |
| `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_DEAL_TOPIC` | The deal log on HCS (optional)                        |

[.env.example](.env.example) explains each one.

### ENS setup (once per market)

```bash
npm run ens:wallet   # makes ENS_REGISTRAR_KEY; fund it with Sepolia ETH
npm run ens:setup    # registers the parent name and prints ENS_REGISTRY
npm run ens:link     # lets the registrar mint subnames (opens MetaMask)
```

After that, every newly published stall gets its name: "Ram Lal Chai" becomes `ram-lal-chai.molbhav.eth`.

### Stall sign

Flash an ESP32 from [firmware/stall-sign](firmware/stall-sign/README.md) with PlatformIO. It
broadcasts its stall's ENS label once the name is live. To set the label by hand, use the serial
command `set ens <label>`.

## Scripts

| Command                    | Description                            |
| -------------------------- | -------------------------------------- |
| `npm run dev`              | Start the dev server                   |
| `npm run build`            | Create a production build              |
| `npm run start`            | Run the production build               |
| `npm run lint`             | Run ESLint                             |
| `npm run format`           | Format with Prettier                   |
| `npm test`                 | Run the tests once                     |
| `npm run test:watch`       | Re-run tests on save                   |
| `npm run db:migrate`       | Apply Postgres migrations              |
| `npm run db:seed-stalls`   | Seed demo stalls                       |
| `npm run db:seed-bargains` | Seed demo bargains                     |
| `npm run redis:ping`       | Check the Redis connection             |
| `npm run ens:wallet`       | Create the ENS registrar wallet        |
| `npm run ens:setup`        | Register the parent ENS name           |
| `npm run ens:link`         | Let the registrar mint subnames        |
| `npm run hcs:topic`        | Create the HCS deal log topic          |
| `npm run ios:dev`          | Sync the iPhone app to your dev server |
| `npm run ios:open`         | Open the iPhone app in Xcode           |

## Design

- Colour system: [docs/colors.md](docs/colors.md); tokens in `src/app/globals.css` (indigo for
  actions, marigold for highlights, emerald for money moved)
- Palette research: [docs/research/color-palette.md](docs/research/color-palette.md)
- Brand and logo: [docs/brand.md](docs/brand.md)
- Database: [docs/database.md](docs/database.md)

## Tests

Tests live in `test/`, apart from the app code, and mirror `src/`: `test/lib/x402.test.ts` tests
`src/lib/x402.ts`. Shared setup and stubs are in `test/support/`. They use [Vitest](https://vitest.dev)
and Testing Library, and need no database or API keys: the database, Gemini, the facilitator and
server-only imports are mocked. Component tests start with `// @vitest-environment jsdom`.
