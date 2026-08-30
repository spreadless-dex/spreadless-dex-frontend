// Creating a pool. One entry point, three backends, chosen from config:
//
//   factory  FACTORY_CONTRACT_ID set. Tranche 2 / D1: the Factory validates
//            the config, deploys deterministically and inserts the registry
//            entry in one call. Not wired yet (method names unknown).
//   deploy   POOL_WASM_HASH set. Deploys the pool contract directly through
//            the SDK's Client.deploy(). Real vault, real signature; the pool
//            is remembered locally so /pools shows it until the registry lands.
//   demo     Neither set. Walks the same phases with a delay and registers a
//            local pool. Nothing is signed. Every screen that shows a demo pool
//            says so.
//
// Callers never branch on the backend except to label the result.

import { getWalletSigner } from "../../store/useAppStore";
import {
  FACTORY_CONTRACT_ID,
  NETWORK_PASSPHRASE,
  POOL_WASM_HASH,
  RPC_URL,
} from "./config";
import { invalidateVaults, shortAddress } from "./registry";
import {
  localPoolFromArgs,
  useLocalPools,
  type CreateBackend,
} from "./localPools";
import {
  percentToBps,
  toConstructorArgs,
  type PoolDraft,
  type TokenMeta,
} from "./poolParams";
import type { OnPhase } from "./types";

export function createBackend(): CreateBackend {
  if (FACTORY_CONTRACT_ID) return "factory";
  if (POOL_WASM_HASH) return "deploy";
  return "demo";
}

export interface CreatePoolResult {
  address: string;
  /** Empty for demo pools. */
  hash: string;
  backend: CreateBackend;
}

interface CreatePoolArgs {
  draft: PoolDraft;
  /** Owner and signer. Must be the connected wallet. */
  owner: string;
  label: string;
  metaFor: (address: string) => TokenMeta | undefined;
  onPhase?: OnPhase;
}

export async function createPool(args: CreatePoolArgs): Promise<CreatePoolResult> {
  const backend = createBackend();
  const ctor = toConstructorArgs(args.draft, args.owner, args.metaFor);
  const meta = {
    feeBps: percentToBps(args.draft.feePct),
    protocolSharePct: args.draft.protocolSharePct,
  };

  let result: CreatePoolResult;
  if (backend === "factory") {
    result = await createViaFactory();
  } else if (backend === "deploy") {
    result = await deployDirect(ctor, args.owner, args.onPhase);
  } else {
    result = await createDemo(ctor, args.onPhase);
  }

  useLocalPools
    .getState()
    .add(localPoolFromArgs(result.address, ctor, args.label, backend, result.hash, meta));
  invalidateVaults();
  return result;
}

// ── Backends ─────────────────────────────────────────────────────────────

async function createViaFactory(): Promise<CreatePoolResult> {
  // Same stance as readFactoryVaults(): guessing the Factory's create method
  // would ship a call that fails silently against the real contract.
  throw new Error(
    `Factory create not wired yet (factory ${shortAddress(FACTORY_CONTRACT_ID!)}). ` +
      `Implement createViaFactory() in src/lib/stellar/factory.ts.`,
  );
}

async function deployDirect(
  ctor: ReturnType<typeof toConstructorArgs>,
  owner: string,
  onPhase?: OnPhase,
): Promise<CreatePoolResult> {
  onPhase?.("preparing");
  const sdk = await import("@spreadless-dex/sdk");
  const signer = await getWalletSigner();

  // Client.deploy() builds the create-contract op with the constructor args,
  // simulates it, and hands back an AssembledTransaction whose result is a
  // Client bound to the new contract id.
  const tx = await sdk.Client.deploy(ctor, {
    wasmHash: POOL_WASM_HASH!,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: owner,
    signAuthEntry: signer.signAuthEntry,
    signTransaction: async (...a: Parameters<typeof signer.signTransaction>) => {
      onPhase?.("signing");
      const res = await signer.signTransaction(...a);
      onPhase?.("submitting");
      return res;
    },
  });
  const sent = await tx.signAndSend();
  const client = sent.result as { options?: { contractId?: string } };
  const address = client?.options?.contractId;
  if (!address) throw new Error("Deploy succeeded but the SDK returned no contract id.");
  return { address, hash: sent.sendTransactionResponse?.hash ?? "", backend: "deploy" };
}

// Demo pools get an id in the same shape as the routing demo's vaults: a
// real C-address prefix, an obviously fake body, and a counter so several
// pools created in one browser never collide.
let demoCounter = 0;

async function createDemo(
  ctor: ReturnType<typeof toConstructorArgs>,
  onPhase?: OnPhase,
): Promise<CreatePoolResult> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  onPhase?.("preparing");
  await wait(700);
  onPhase?.("signing");
  await wait(900);
  onPhase?.("submitting");
  await wait(800);
  const n = (Date.now() % 100_000).toString(36).toUpperCase() + (demoCounter++).toString(36).toUpperCase();
  const tag = ctor.tokens.length.toString();
  const address = `CDEMO${"0".repeat(56 - 5 - n.length - tag.length - 4)}${tag}${n}POOL`.slice(0, 56);
  return { address, hash: "", backend: "demo" };
}
