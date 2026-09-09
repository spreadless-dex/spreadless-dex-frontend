// Creating a pool. One entry point, three backends, chosen from config:
//
//   factory  FACTORY_CONTRACT_ID set. Tranche 2 / D1: the Factory validates
//            the config, deploys deterministically and inserts the registry
//            entry in one call. Not wired yet (method names unknown).
//   deploy   POOL_WASM_HASH set. Deploys the pool contract directly through
//            the SDK's Client.deploy(). This is the live path today. A pool
//            built this way is real but unregistered, so it routes single-hop
//            only; see POOL_WASM_HASH in config.ts.
//   demo     Neither set. Walks the same phases with a delay and registers a
//            local pool. Nothing is signed. Every screen that shows a demo pool
//            says so.
//
// Callers never branch on the backend except to label the result.

import {
  FACTORY_CONTRACT_ID,
  NETWORK_PASSPHRASE,
  POOL_WASM_HASH,
  RPC_URL,
} from "./config";
import { getWalletSigner } from "../../store/useAppStore";
import { invalidateVaults, shortAddress } from "./registry";
import { invalidateVaultTvl } from "./vaultTvl";
import {
  localPoolFromArgs,
  useLocalPools,
  type CreateBackend,
} from "./localPools";
import {
  percentToBps,
  PROTOCOL_SHARE_PCT,
  toConstructorArgs,
  type ARight,
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
  /** Echoed from the draft. It is now a constructor argument, so it is settled the moment the pool exists. */
  aRight: ARight;
}

interface CreatePoolArgs {
  draft: PoolDraft;
  /** Signer and owner. The creator owns every pool they deploy; see below. */
  creator: string;
  label: string;
  metaFor: (address: string) => TokenMeta | undefined;
  onPhase?: OnPhase;
}

// ONE SIGNATURE, and the creator owns what they made.
//
// This used to be two. "Fixed" meant the creator deployed and then gave
// ownership up, because the old contract had a single owner role and leaving
// the pool ownerless was the only way to freeze A. That is over: amp_control
// is a constructor argument, so a Fixed pool is frozen the moment it exists,
// by the same signature that created it, and a Flexible one is delegated to
// the protocol_controller the same way. Neither needs a handover.
//
// Ownership therefore stays with the creator in both cases, and giving it up
// moved to the pool page, where OwnershipPanel already offers transfer and
// renounce. Three reasons it does not belong here:
//
//   - it is no longer part of the promise the builder makes. A is settled;
//     what an owner still holds is the fee, the caps and pause.
//   - a second signature that failed used to strand a pool in "undecided",
//     the flow's worst state, for a step the creator can take any time.
//   - the contract has an OwnershipRenunciationDisabled error (#22) and the
//     bindings do not say when it fires. Making it a mandatory step of every
//     Fixed deploy would be building the happy path on an unverified call.
export async function createPool(args: CreatePoolArgs): Promise<CreatePoolResult> {
  const backend = createBackend();
  const ctor = toConstructorArgs(args.draft, args.creator, args.metaFor);
  const meta = {
    feeBps: percentToBps(args.draft.feePct),
    protocolSharePct: PROTOCOL_SHARE_PCT,
  };

  let result: Omit<CreatePoolResult, "aRight">;
  if (backend === "factory") {
    result = await createViaFactory();
  } else if (backend === "deploy") {
    result = await deployDirect(ctor, args.creator, args.onPhase);
  } else {
    result = await createDemo(ctor, args.onPhase);
  }

  const local = localPoolFromArgs(result.address, ctor, args.label, backend, result.hash, meta);
  useLocalPools.getState().add(local);
  invalidateVaults();
  invalidateVaultTvl();

  return { ...result, aRight: args.draft.aRight };
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

// Deploy the pool contract straight from the installed WASM, with the twelve
// constructor arguments toConstructorArgs() built.
//
// Client.deploy() fetches the spec by wasm hash to encode those arguments, so
// a wrong or uninstalled hash fails here rather than on chain; mapTxError maps
// that to "the pool code is not installed". The deployed address comes back
// through the SDK's own result parser, which hands us a Client bound to the
// new contract, so it is read off that rather than decoded a second time.
//
// The signer is wrapped exactly as writeClient() wraps it, so the builder's
// phase labels ("signing", "submitting") line up with the wallet popping up.
async function deployDirect(
  ctor: ReturnType<typeof toConstructorArgs>,
  owner: string,
  onPhase?: OnPhase,
): Promise<Omit<CreatePoolResult, "aRight">> {
  onPhase?.("preparing");
  const sdk = await import("@spreadless-dex/sdk");
  const signer = await getWalletSigner();

  const tx = await sdk.Client.deploy(ctor, {
    wasmHash: POOL_WASM_HASH!,
    format: "hex",
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
  const address = sent.result.options.contractId;
  return { address, hash: sent.sendTransactionResponse?.hash ?? "", backend: "deploy" };
}

// Demo pools get an id in the same shape as the routing demo's vaults: a
// real C-address prefix, an obviously fake body, and a counter so several
// pools created in one browser never collide.
let demoCounter = 0;

async function createDemo(
  ctor: ReturnType<typeof toConstructorArgs>,
  onPhase?: OnPhase,
): Promise<Omit<CreatePoolResult, "aRight">> {
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
