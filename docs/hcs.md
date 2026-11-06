# Deal log on Hedera Consensus Service

Every deal MolBhav's agents make is posted to one public Hedera Consensus Service (HCS) topic, so
anyone can check what was agreed and paid without trusting our database. The topic's submit key is
the market's operator key: only MolBhav can post to it, and everyone can read it.

Testnet topic: [0.0.11345649](https://hashscan.io/testnet/topic/0.0.11345649)

## Messages

One JSON message per event, posted after the response so agreeing or paying never waits on Hedera.

When a price is agreed (Agree button, or the buyer's agent choosing the best offer):

```json
{
  "v": 1,
  "type": "deal.agreed",
  "bargain": "0b0c2f5e-…",
  "stall": "u-de9ef328",
  "ens": "niraj-briyani.molbhav.eth",
  "agent": "agent_ccc3a3558f",
  "item": "Chicken Biryani",
  "priceInr": 190,
  "at": "2026-11-07T10:00:00.000Z"
}
```

When the deal is paid over x402 (by the buyer, or by their agent with "pay for me"):

```json
{
  "v": 1,
  "type": "deal.paid",
  "bargain": "0b0c2f5e-…",
  "stall": "u-de9ef328",
  "ens": "niraj-briyani.molbhav.eth",
  "payTo": "0.0.11345070",
  "amount": "1267000000",
  "payTx": "0.0.9185802@1793992758.336517547",
  "at": "2026-11-07T10:00:09.000Z"
}
```

- `ens` is the stall agent's ENS name once it is live, else `null`.
- `amount` is in tinybars; `payTx` is the settlement on HashScan.
- No buyer identity (email, wallet, user id) is ever posted.

Read it from the mirror node:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11345649/messages?order=desc&limit=5" \
  | jq -r '.messages[].message | @base64d'
```

## Setup

1. Make a testnet account at [portal.hedera.com](https://portal.hedera.com) and put its account id
   and private key in `.env.local` as `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY` (DER or hex).
2. `npm run hcs:topic` creates the topic and saves `HEDERA_DEAL_TOPIC` in `.env.local`.
3. Add all three to Vercel.

Without them nothing is logged and everything else works the same. Each message costs about
$0.0001, paid by the operator account. The code is in `src/lib/server/hedera/deal-log.ts`.
