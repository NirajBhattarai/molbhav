// One-time: registers the market's ENS name on ENSv2 Sepolia (default molbhav.eth) with its own
// subname registry (a UserRegistry: every stall agent becomes a token-owned subname in it) and its
// own Permissioned Resolver (the market's agent-context). Run after `npm run ens:wallet`:
//   npm run ens:setup [-- --label molbhav]
// Prints the ENS_* lines to add to .env.local (and to Vercel).
import { setTimeout as sleep } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseEventLogs,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  ethRegistrarCommitSnippet,
  ethRegistrarGetRegisterPriceSnippet,
  ethRegistrarIsAvailableSnippet,
  ethRegistrarMakeCommitmentSnippet,
  ethRegistrarRegisterSnippet,
} from "@ensdomains/ensjs-abi/v2/ethRegistrar";
import {
  proxyDeployedEventSnippet,
  subregistryInitializeSnippet,
  verifiableFactoryDeployProxySnippet,
} from "@ensdomains/ensjs-abi/v2/verifiableFactory";
import { permissionedResolverInitializeSnippet } from "@ensdomains/ensjs-abi/v2/permissionedResolver";
import { userRegistrySetParentSnippet } from "@ensdomains/ensjs-abi/v2/userRegistry";
import { resolverMulticallParameters } from "@ensdomains/ensjs/utils/v2";

process.loadEnvFile?.(".env.local");
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

// ENSv2 on Sepolia: https://docs.ens.domains/learn/deployments/
const C = {
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  factory: "0xda70306c98e97ece36f997a21368e53298572991",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  resolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  mockUsdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
};
const ALL_ROLES = BigInt("0x" + "1".repeat(64));
const YEAR = 31_536_000n;

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

async function send(what, params) {
  const hash = await wallet.writeContract(params);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${what} failed: ${hash}`);
  console.log(`  ✓ ${what}  https://sepolia.etherscan.io/tx/${hash}`);
  return receipt;
}

/** Deploys a proxy of `impl` through the VerifiableFactory; returns its address. */
async function deployProxy(what, impl, initData) {
  const salt = BigInt(toHex(crypto.getRandomValues(new Uint8Array(32))));
  const receipt = await send(what, {
    address: C.factory,
    abi: verifiableFactoryDeployProxySnippet,
    functionName: "deployProxy",
    args: [impl, salt, initData],
  });
  const [log] = parseEventLogs({ abi: proxyDeployedEventSnippet, logs: receipt.logs });
  if (!log) throw new Error(`${what}: no ProxyDeployed event`);
  return log.args.proxyAddress;
}

console.log(`Registrar ${account.address}`);
const eth = await pub.getBalance({ address: account.address });
console.log(`Balance ${formatEther(eth)} Sepolia ETH`);
if (eth < 10n ** 16n) throw new Error("Fund the registrar with at least 0.01 Sepolia ETH first.");

const free = await pub.readContract({
  address: C.ethRegistrar,
  abi: ethRegistrarIsAvailableSnippet,
  functionName: "isAvailable",
  args: [label],
});
if (!free) throw new Error(`${parent} is taken. Pick another: npm run ens:setup -- --label <name>`);

console.log(`\n1. The subname registry for ${parent} (stall agents live here)`);
const registry = await deployProxy(
  "UserRegistry deployed",
  C.userRegistryImpl,
  encodeFunctionData({
    abi: subregistryInitializeSnippet,
    functionName: "initialize",
    args: [[{ account: account.address, roleBitmap: ALL_ROLES }]],
  }),
);

console.log(`\n2. ${parent}'s own resolver, with the market's agent records`);
const records = await resolverMulticallParameters({
  name: parent,
  texts: [
    {
      key: "agent-context",
      value: JSON.stringify({
        kind: "molbhav-market",
        about: "Street-market stalls, each with an AI agent you can bargain with over A2A.",
        stalls: `Every stall agent is a subname: <stall>.${parent} (agent-endpoint[a2a] = its Agent Card).`,
      }),
    },
    { key: "description", value: "Molbhav: bargain with street-stall AI agents." },
    { key: "url", value: site },
  ],
});
const resolver = await deployProxy(
  "PermissionedResolver deployed",
  C.resolverImpl,
  encodeFunctionData({
    abi: permissionedResolverInitializeSnippet,
    functionName: "initialize",
    args: [
      [{ account: account.address, roleBitmap: ALL_ROLES }],
      records.map((r) => encodeFunctionData(r)),
    ],
  }),
);

console.log(`\n3. Register ${parent} (commit, wait a minute, register)`);
const [base, premium] = await pub.readContract({
  address: C.ethRegistrar,
  abi: ethRegistrarGetRegisterPriceSnippet,
  functionName: "getRegisterPrice",
  args: [label, YEAR, C.mockUsdc],
});
const price = base + premium;
const decimals = await pub.readContract({
  address: C.mockUsdc,
  abi: erc20Abi,
  functionName: "decimals",
});
console.log(`  price ${formatUnits(price, decimals)} MockUSDC for a year`);
const usdc = await pub.readContract({
  address: C.mockUsdc,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
if (usdc < price) {
  await send("MockUSDC minted", {
    address: C.mockUsdc,
    abi: [
      {
        type: "function",
        name: "mint",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
      },
    ],
    functionName: "mint",
    args: [account.address, price * 2n],
  });
}
await send("MockUSDC approved", {
  address: C.mockUsdc,
  abi: erc20Abi,
  functionName: "approve",
  args: [C.ethRegistrar, price],
});
const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
const referrer = `0x${"0".repeat(64)}`;
const commitment = await pub.readContract({
  address: C.ethRegistrar,
  abi: ethRegistrarMakeCommitmentSnippet,
  functionName: "makeCommitment",
  args: [label, account.address, secret, registry, resolver, YEAR, referrer],
});
await send("committed", {
  address: C.ethRegistrar,
  abi: ethRegistrarCommitSnippet,
  functionName: "commit",
  args: [commitment],
});
console.log("  waiting 70 s (commit-reveal)…");
await sleep(70_000);
await send(`${parent} registered`, {
  address: C.ethRegistrar,
  abi: ethRegistrarRegisterSnippet,
  functionName: "register",
  args: [label, account.address, secret, registry, resolver, YEAR, C.mockUsdc, referrer],
});

console.log(`\n4. Tell the registry its place in the tree (${parent})`);
await send("registry parent set", {
  address: registry,
  abi: userRegistrySetParentSnippet,
  functionName: "setParent",
  args: [C.ethRegistry, label],
});

console.log(`\nDone. Add to .env.local (and to Vercel):\n`);
console.log(`ENS_PARENT=${parent}`);
console.log(`ENS_REGISTRY=${registry}`);
console.log(`ENS_PARENT_RESOLVER=${resolver}`);
console.log(`\nSee it: https://sepolia.app.ens.domains/${parent}`);
