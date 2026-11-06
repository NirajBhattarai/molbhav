// Creates the market's deal log: a Hedera Consensus Service topic only the operator key can post
// to, and saves its id in .env.local as HEDERA_DEAL_TOPIC. Needs HEDERA_OPERATOR_ID and
// HEDERA_OPERATOR_KEY (from portal.hedera.com) in .env.local. Run once per market:
//   npm run hcs:topic
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { Client, Hbar, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";

const FILE = ".env.local";
const text = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const get = (k) =>
  (
    process.env[k] ??
    text
      .split("\n")
      .find((l) => l.startsWith(`${k}=`))
      ?.slice(k.length + 1)
  )
    ?.trim()
    .replace(/^"(.*)"$/, "$1");

const existing = get("HEDERA_DEAL_TOPIC");
if (existing) {
  console.log(`${FILE} already has HEDERA_DEAL_TOPIC=${existing}; nothing to do.`);
  process.exit(0);
}
const id = get("HEDERA_OPERATOR_ID");
const keyText = get("HEDERA_OPERATOR_KEY");
if (!id || !keyText) {
  console.error(`Add HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY to ${FILE} first.`);
  process.exit(1);
}

let key;
try {
  key = PrivateKey.fromStringDer(keyText);
} catch {
  key = /^(0x)?[0-9a-f]{64}$/i.test(keyText)
    ? PrivateKey.fromStringECDSA(keyText)
    : PrivateKey.fromString(keyText);
}

const mainnet = (get("NEXT_PUBLIC_HEDERA_NETWORK") ?? "testnet").toLowerCase() === "mainnet";
const client = (mainnet ? Client.forMainnet() : Client.forTestnet())
  .setOperator(id, key)
  .setDefaultMaxTransactionFee(new Hbar(2));

const tx = await new TopicCreateTransaction()
  .setTopicMemo("MolBhav deal log: agreed and paid deals")
  .setSubmitKey(key.publicKey)
  .setAdminKey(key.publicKey)
  .execute(client);
const topic = (await tx.getReceipt(client)).topicId.toString();
client.close();

appendFileSync(FILE, `${text.endsWith("\n") || !text ? "" : "\n"}HEDERA_DEAL_TOPIC=${topic}\n`);
console.log(`Deal log topic ${topic} saved to ${FILE} (HEDERA_DEAL_TOPIC).`);
console.log(`See it: https://hashscan.io/${mainnet ? "mainnet" : "testnet"}/topic/${topic}`);
console.log("Add HEDERA_DEAL_TOPIC to Vercel too.");
