import "server-only";
import { after } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import {
  proxyDeployedEventSnippet,
  verifiableFactoryDeployProxySnippet,
} from "@ensdomains/ensjs-abi/v2/verifiableFactory";
import {
  permissionedResolverGrantSetterRolesSnippet,
  permissionedResolverInitializeSnippet,
  permissionedResolverMulticallSnippet,
} from "@ensdomains/ensjs-abi/v2/permissionedResolver";
import { userRegistryRegisterSnippet } from "@ensdomains/ensjs-abi/v2/userRegistry";
import { permissionedRegistryGetResolverSnippet } from "@ensdomains/ensjs-abi/v2/permissionedRegistry";
import { encodeResolverSetterScope, resolverMulticallParameters } from "@ensdomains/ensjs/utils/v2";
import {
  ENS_PARENT_DEFAULT,
  HEDERA_TESTNET_COIN,
  KEY,
  ensName,
  OWNER_EDITS,
  freeLabel,
  ownerAddress,
  recordsKey,
  stallLabel,
  stallRecords,
  type StallRecords,
} from "@/lib/ens";
import { appBase } from "@/lib/server/a2a/client";
import { agentUrls, forgetAgents } from "@/lib/server/a2a/stall";
import { query } from "@/lib/server/db";
import { redis, redisConfigured } from "@/lib/server/redis";

/*
 * Stall agents as ENSv2 namespaces, on Sepolia. Each stall agent gets <label>.<ENS_PARENT>:
 *   - a token in the market's own subname registry (a UserRegistry), owned by the shop's wallet,
 *     with no right to repoint its resolver (so the records stay the market's to vouch for);
 *   - its own Permissioned Resolver, so rights granted on it cover this one name only;
 *   - records: agent-context and agent-endpoint[a2a] (ENSIP-26), payout addresses (ENSIP-11);
 *   - Enhanced Access Control: the shop's wallet may change only its description and its
 *     Hedera payout address; everything else stays the market's.
 * The market's registrar wallet (ENS_REGISTRAR_KEY) sends every transaction. See docs/ens.md.
 */

// ENSv2 on Sepolia: https://docs.ens.domains/learn/deployments/
const FACTORY = "0xda70306c98e97ece36f997a21368e53298572991";
const RESOLVER_IMPL = "0x115eb53f0c60696633855f90b138178fb40b2b2c";
const ALL_ROLES = BigInt("0x" + "1".repeat(64));
/** Registry roles the shop's wallet holds on its name: renew it. Not repoint, not transfer. */
const OWNER_ROLES = BigInt(0x10000); // ROLE_RENEW
const YEAR_S = BigInt(31_536_000);
const LOCK_S = 300;

const key = () => process.env.ENS_REGISTRAR_KEY?.trim() as Hex | undefined;
const registry = () => process.env.ENS_REGISTRY?.trim() as Address | undefined;

export const ensConfigured = () => Boolean(key() && registry());
export const ensParent = () => process.env.ENS_PARENT?.trim() || ENS_PARENT_DEFAULT;
export const ensNameOf = (label: string) => ensName(label, ensParent());
/** Where people can look at a name. */
export const ensAppUrl = (name: string) => `https://sepolia.app.ens.domains/${name}`;

const transport = () =>
  http(process.env.SEPOLIA_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com");
const reader = () => createPublicClient({ chain: sepolia, transport: transport() });

type StallRow = {
  id: string;
  name: string;
  agent_id: string | null;
  owner_id: string;
  ens_label: string | null;
  ens_resolver: string | null;
  ens_status: "resolver" | "registered" | "live" | null;
  ens_records: string | null;
};

/** Without Redis: one run at a time in this process (two would each deploy a resolver). */
let running = false;

/** One transaction sequence at a time across instances: the registrar has one nonce. */
async function withLock(run: () => Promise<void>) {
  if (!redisConfigured()) {
    if (running) return;
    running = true;
    try {
      return await run();
    } finally {
      running = false;
    }
  }
  const client = await redis();
  const got = await client.set("ens:registrar", "1", { NX: true, EX: LOCK_S });
  if (!got) return; // another instance is writing; the next shop save or visit picks this up
  try {
    await run();
  } finally {
    await client.del("ens:registrar").catch(() => {});
  }
}

const calls = async (name: string, r: StallRecords) =>
  (await resolverMulticallParameters({ name, texts: r.texts, coins: r.coins })).map((c) =>
    encodeFunctionData(c as Parameters<typeof encodeFunctionData>[0]),
  );

/**
 * Gives a stall agent its ENS name, or brings its records up to date. Safe to call often: it does
 * nothing once the chain has the current records, and a run cut short resumes at its last step.
 */
export async function syncStallName(stallId: string): Promise<void> {
  if (!ensConfigured()) return;
  await withLock(async () => {
    const [s] = await query<StallRow>(
      `SELECT id, name, agent_id, owner_id, ens_label, ens_resolver, ens_status, ens_records
       FROM stalls WHERE id = $1`,
      [stallId],
    );
    if (!s?.agent_id || !s.name.trim()) return;

    const base = appBase();
    const payout = ownerAddress(s.owner_id);
    const records = stallRecords({
      name: s.name,
      agentId: s.agent_id,
      cardUrl: agentUrls(base, s.agent_id).card,
      site: base,
      payout,
    });
    const want = recordsKey(records);
    if (s.ens_status === "live" && s.ens_records === want) return;

    const account = privateKeyToAccount(key()!);
    const pub = reader();
    const wallet = createWalletClient({ chain: sepolia, transport: transport(), account });
    const send = async (params: Parameters<typeof wallet.writeContract>[0]) => {
      const hash = await wallet.writeContract(params);
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`ens tx failed: ${hash}`);
      return receipt;
    };
    const save = (set: string, args: unknown[]) =>
      query(`UPDATE stalls SET ${set} WHERE id = $1`, [s.id, ...args]);

    // 1. A free label, kept in the database (UNIQUE) before anything goes on chain.
    let label = s.ens_label;
    if (!label) {
      const wanted = stallLabel(s.name) ?? s.agent_id.replace("_", "-");
      const taken = new Set(
        (
          await query<{ ens_label: string }>(
            "SELECT ens_label FROM stalls WHERE ens_label LIKE $1 AND id <> $2",
            [`${wanted}%`, s.id],
          )
        ).map((r) => r.ens_label),
      );
      label = freeLabel(wanted, (l) => taken.has(l));
      if (!label) return;
      await save("ens_label = $2", [label]);
    }
    const name = normalize(ensNameOf(label));

    // 2. Its own resolver, born with the records (the registrar holds every role on it).
    let resolver = s.ens_resolver as Address | null;
    if (!resolver || !s.ens_status) {
      const receipt = await send({
        address: FACTORY,
        abi: verifiableFactoryDeployProxySnippet,
        functionName: "deployProxy",
        args: [
          RESOLVER_IMPL,
          BigInt(toHex(crypto.getRandomValues(new Uint8Array(32)))),
          encodeFunctionData({
            abi: permissionedResolverInitializeSnippet,
            functionName: "initialize",
            args: [
              [{ account: account.address, roleBitmap: ALL_ROLES }],
              await calls(name, records),
            ],
          }),
        ],
      });
      const [log] = parseEventLogs({ abi: proxyDeployedEventSnippet, logs: receipt.logs });
      if (!log) throw new Error("ens: no ProxyDeployed event");
      resolver = log.args.proxyAddress as Address;
      await save("ens_resolver = $2, ens_status = 'resolver', ens_records = $3", [resolver, want]);
      s.ens_status = "resolver";
      s.ens_records = want;
    }

    // 3. The subname itself: a token in the market's registry, owned by the shop's wallet.
    if (s.ens_status === "resolver") {
      await send({
        address: registry()!,
        abi: userRegistryRegisterSnippet,
        functionName: "register",
        args: [
          label,
          payout ?? account.address,
          "0x0000000000000000000000000000000000000000",
          resolver,
          OWNER_ROLES,
          BigInt(Math.floor(Date.now() / 1000)) + YEAR_S,
        ],
      });
      await save("ens_status = 'registered'", []);
      s.ens_status = "registered";
    }

    // Once registered, the registry says which resolver the name uses: trust it over the database.
    const onChain = (await pub.readContract({
      address: registry()!,
      abi: permissionedRegistryGetResolverSnippet,
      functionName: "getResolver",
      args: [label],
    })) as Address;
    if (onChain.toLowerCase() !== resolver!.toLowerCase()) {
      resolver = onChain;
      await save("ens_resolver = $2", [resolver]);
    }

    // 4. Enhanced Access Control: the shop's wallet may edit just these records on its own name.
    if (s.ens_status === "registered") {
      if (payout) {
        const scopes = [
          ...OWNER_EDITS.texts.map((k) => ({ kind: "text" as const, key: k })),
          ...OWNER_EDITS.coins.map((c) => ({ kind: "address" as const, coinType: BigInt(c) })),
        ];
        for (const scope of scopes)
          await send({
            address: resolver!,
            abi: permissionedResolverGrantSetterRolesSnippet,
            functionName: "grantSetterRoles",
            args: [encodeResolverSetterScope(scope), payout],
          });
      }
      await save("ens_status = 'live'", []);
      s.ens_status = "live";
      await forgetAgents(s.agent_id); // its Agent Card now shows the name
    }

    // 5. Records changed since (a new stall name, a new wallet): rewrite them in one multicall.
    if (s.ens_records !== want) {
      await send({
        address: resolver!,
        abi: permissionedResolverMulticallSnippet,
        functionName: "multicall",
        args: [await calls(name, records)],
      });
      await save("ens_records = $2", [want]);
    }
  });
}

/**
 * Runs syncStallName after the response is sent (it takes a few blocks), logging failures: they
 * retry on the next shop save or visit.
 */
export function syncStallNameAfter(stallId: string) {
  if (!ensConfigured()) return;
  after(() => syncStallName(stallId).catch((e) => console.error("ens sync", stallId, e)));
}

/** Where a stall is paid on Hedera testnet, read from its ENS name (ENSIP-11 coin type 296). */
export async function hederaAddressFromEns(name: string): Promise<`0x${string}` | null> {
  const address = await reader().getEnsAddress({
    name: normalize(name),
    coinType: BigInt(HEDERA_TESTNET_COIN),
  });
  return address ?? null;
}

/** A stall agent's Agent Card URL, read from its ENS name (agent-endpoint[a2a]). */
export async function cardFromEns(name: string): Promise<string | null> {
  const card = await reader().getEnsText({ name: normalize(name), key: KEY.a2a });
  return card?.startsWith("http") ? card : null;
}
