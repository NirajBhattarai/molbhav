// Makes the market's ENS registrar wallet (Sepolia) and saves its key in .env.local as
// ENS_REGISTRAR_KEY, without printing it. Prints only the address to fund with Sepolia ETH.
//   npm run ens:wallet
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const FILE = ".env.local";
const text = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const line = text.split("\n").find((l) => l.startsWith("ENS_REGISTRAR_KEY="));
let key = line?.slice("ENS_REGISTRAR_KEY=".length).trim();
if (!key) {
  key = generatePrivateKey();
  appendFileSync(FILE, `${text.endsWith("\n") || !text ? "" : "\n"}ENS_REGISTRAR_KEY=${key}\n`);
  console.log(`New registrar wallet saved to ${FILE} (ENS_REGISTRAR_KEY).`);
} else {
  console.log(`${FILE} already has ENS_REGISTRAR_KEY; using it.`);
}
console.log(`Address: ${privateKeyToAccount(key).address}`);
console.log("Fund it with ~0.05 Sepolia ETH, then run: npm run ens:setup");
