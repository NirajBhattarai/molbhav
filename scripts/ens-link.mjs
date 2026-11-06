// For a market name you registered yourself (e.g. molbhav.eth from MetaMask on ENSv2 Sepolia):
// the registrar wallet deploys the name's subname registry (you and it are both admins), then a
// local page lets your wallet attach it with one transaction (setSubregistry). Stall agents' names
// are then created in it by the app. Run after `npm run ens:wallet` (and funding it):
//   npm run ens:link [-- --label molbhav]
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  labelhash,
  parseEventLogs,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  permissionedRegistryGetStateSnippet,
  permissionedRegistryGetSubregistrySnippet,
  permissionedRegistryGetResolverSnippet,
} from "@ensdomains/ensjs-abi/v2/permissionedRegistry";
import {
  proxyDeployedEventSnippet,
  subregistryInitializeSnippet,
  verifiableFactoryDeployProxySnippet,
} from "@ensdomains/ensjs-abi/v2/verifiableFactory";
import { permissionedResolverMulticallSnippet } from "@ensdomains/ensjs-abi/v2/permissionedResolver";
import {
  userRegistrySetParentSnippet,
  userRegistrySetSubregistrySnippet,
} from "@ensdomains/ensjs-abi/v2/userRegistry";
import { resolverMulticallParameters } from "@ensdomains/ensjs/utils/v2";

process.loadEnvFile?.(".env.local");
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

// ENSv2 on Sepolia: https://docs.ens.domains/learn/deployments/
const C = {
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  factory: "0xda70306c98e97ece36f997a21368e53298572991",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
};
const ALL_ROLES = BigInt("0x" + "1".repeat(64));
const ZERO = "0x0000000000000000000000000000000000000000";
const PORT = 5747;

const key = process.env.ENS_REGISTRAR_KEY?.trim();
if (!key) throw new Error("ENS_REGISTRAR_KEY is not set: run `npm run ens:wallet` first.");
const account = privateKeyToAccount(key);
const transport = http(
  process.env.SEPOLIA_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com",
);
const pub = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ chain: sepolia, transport, account });
const label = (arg("label") ?? "molbhav").toLowerCase();
const parent = `${label}.eth`;
const site = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://molbhav-eta.vercel.app").replace(
  /\/$/,
  "",
);

const read = (abi, functionName, args) =>
  pub.readContract({ address: C.ethRegistry, abi, functionName, args });

const state = await read(permissionedRegistryGetStateSnippet, "getState", [
  BigInt(labelhash(label)),
]);
if (state.status !== 2) throw new Error(`${parent} isn't registered on ENSv2 Sepolia yet.`);
const owner = state.latestOwner;
const resolver = await read(permissionedRegistryGetResolverSnippet, "getResolver", [label]);
console.log(`${parent}: owner ${owner}, resolver ${resolver}`);
console.log(`Registrar ${account.address}`);

// 1. The subname registry (reuse the one in .env.local if it's already there).
let registry = arg("registry") ?? process.env.ENS_REGISTRY?.trim();
const attached = await read(permissionedRegistryGetSubregistrySnippet, "getSubregistry", [label]);
if (registry && attached.toLowerCase() === registry.toLowerCase()) {
  console.log(`Already attached: ${registry}. Nothing to do.`);
  process.exit(0);
}
if (!registry || !(await pub.getCode({ address: registry }))) {
  const eth = await pub.getBalance({ address: account.address });
  console.log(`Registrar balance ${formatEther(eth)} Sepolia ETH`);
  if (eth < 5n * 10n ** 15n) throw new Error("Fund the registrar with ~0.02 Sepolia ETH first.");
  const hash = await wallet.writeContract({
    address: C.factory,
    abi: verifiableFactoryDeployProxySnippet,
    functionName: "deployProxy",
    args: [
      C.userRegistryImpl,
      BigInt(toHex(crypto.getRandomValues(new Uint8Array(32)))),
      encodeFunctionData({
        abi: subregistryInitializeSnippet,
        functionName: "initialize",
        // You keep every role; the registrar gets them too, to create stall agents' names.
        args: [
          [
            { account: owner, roleBitmap: ALL_ROLES },
            { account: account.address, roleBitmap: ALL_ROLES },
          ],
        ],
      }),
    ],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const [log] = parseEventLogs({ abi: proxyDeployedEventSnippet, logs: receipt.logs });
  if (receipt.status !== "success" || !log) throw new Error(`registry deploy failed: ${hash}`);
  registry = log.args.proxyAddress;
  console.log(`✓ subname registry ${registry}  https://sepolia.etherscan.io/tx/${hash}`);
  const parentHash = await wallet.writeContract({
    address: registry,
    abi: userRegistrySetParentSnippet,
    functionName: "setParent",
    args: [C.ethRegistry, label],
  });
  await pub.waitForTransactionReceipt({ hash: parentHash });
  console.log(`✓ registry knows its place (${parent})`);
}

// 2. Your wallet's transactions, sent from a local page through MetaMask.
const attach = encodeFunctionData({
  abi: userRegistrySetSubregistrySnippet,
  functionName: "setSubregistry",
  args: [BigInt(labelhash(label)), registry],
});
const records =
  resolver !== ZERO
    ? encodeFunctionData({
        abi: permissionedResolverMulticallSnippet,
        functionName: "multicall",
        args: [
          (
            await resolverMulticallParameters({
              name: parent,
              texts: [
                {
                  key: "agent-context",
                  value: JSON.stringify({
                    kind: "molbhav-market",
                    about:
                      "Street-market stalls, each with an AI agent you can bargain with over A2A.",
                    stalls: `Every stall agent is a subname: <stall>.${parent} (agent-endpoint[a2a] = its Agent Card).`,
                  }),
                },
                { key: "description", value: "Molbhav: bargain with street-stall AI agents." },
                { key: "url", value: site },
              ],
            })
          ).map((c) => encodeFunctionData(c)),
        ],
      })
    : null;

const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Link ${parent}</title>
<style>body{font:16px system-ui;max-width:34rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
button{font:inherit;padding:.6rem 1rem;margin:.4rem 0;border-radius:.6rem;border:1px solid #888;cursor:pointer}
code{word-break:break-all}#log{white-space:pre-wrap;color:#555}</style>
<h1>Link ${parent} to its stall agents</h1>
<p>Owner: <code>${owner}</code><br>Subname registry: <code>${registry}</code></p>
<p><button id="attach">1. Attach the subname registry</button><br>
${records ? `<button id="records">2. Add the market's agent records (optional)</button>` : ""}</p>
<p id="log"></p>
<script>
const log = (m) => (document.getElementById("log").textContent += m + "\\n");
// EIP-6963: talk to MetaMask itself, even when another wallet extension has taken window.ethereum.
const wallets = [];
window.addEventListener("eip6963:announceProvider", (e) => wallets.push(e.detail));
window.dispatchEvent(new Event("eip6963:requestProvider"));
setTimeout(() => log("Wallets found: " + (wallets.map((w) => w.info.name).join(", ") || "none")), 500);
function metamask() {
  const mm = wallets.find((w) => w.info.rdns === "io.metamask");
  return mm ? mm.provider : null;
}
async function send(to, data) {
  const p = metamask();
  if (!p) return log("MetaMask not found: open this page in the Chrome profile that has MetaMask.");
  const [from] = await p.request({ method: "eth_requestAccounts" });
  if (from.toLowerCase() !== "${owner}".toLowerCase()) return log("Switch MetaMask to the owner account ${owner}.");
  await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
  const hash = await p.request({ method: "eth_sendTransaction", params: [{ from, to, data }] });
  log("Sent: https://sepolia.etherscan.io/tx/" + hash);
}
const fail = (e) => log("Error: " + (e && (e.message || JSON.stringify(e))));
document.getElementById("attach").onclick = () => send("${C.ethRegistry}", "${attach}").catch(fail);
${records ? `document.getElementById("records").onclick = () => send("${resolver}", "${records}").catch(fail);` : ""}
</script>`;

const server = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(page);
}).listen(PORT, "127.0.0.1");
console.log(
  `\nOpen http://localhost:${PORT} in the browser with your MetaMask and press button 1.`,
);
console.log("Waiting for the chain to show it attached…");

for (;;) {
  await sleep(5_000);
  const now = await read(permissionedRegistryGetSubregistrySnippet, "getSubregistry", [label]);
  if (now.toLowerCase() === registry.toLowerCase()) break;
}
server.close();
console.log(
  `\n✓ ${parent} now hands out stall agents' names. Add to .env.local (and to Vercel):\n`,
);
console.log(`ENS_PARENT=${parent}`);
console.log(`ENS_REGISTRY=${registry}`);
console.log(`\nThen open your shop screen: its stall agent gets its name in the background.`);
process.exit(0);
