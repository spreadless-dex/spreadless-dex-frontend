// Creating a pool. One entry point, three backends, chosen from config:
//
//   factory  FACTORY_CONTRACT_ID set. The Router deploys the pool, makes
//            itself its protocol_controller, applies the protocol fee defaults
//            and registers it under a numeric id, all in one call. This is the
//            live path, and the only one that yields a routable pool.
//   deploy   POOL_WASM_HASH set, Factory not. Deploys the pool contract
//            directly through the SDK's Client.deploy(). Real, but outside the
//            registry: no pool id, single-hop only, invisible to other
//            browsers. A fallback, see POOL_WASM_HASH in config.ts.
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
import { invalidateVaults } from "./registry";
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
  toRouterArgs,
  type ARight,
  type PoolDraft,
  type TokenMeta,
} from "./poolParams";
import { routerClient } from "./routerClient";
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
  /**
   * The Router's registry id, set only for pools it created and only when the
   * read-back confirmed it. Multi-hop routing addresses pools by this, not by
   * contract address, so a pool without one is single-hop until it is re-read.
   */
  poolId?: number;
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
// Ownership therefore stays with the creator in both cases, and handing it on
// moved to the pool page, where OwnershipPanel already offers the transfer.
// Three reasons it does not belong here:
//
//   - it is no longer part of the promise the builder makes. A is settled;
//     what an owner still holds is the fee, the caps and pause.
//   - a second signature that failed used to strand a pool in "undecided",
//     the flow's worst state, for a step the creator can take any time.
//   - it could not have worked. renounce_ownership() is kept in the standard
//     Ownable interface but always fails (#22 OwnershipRenunciationDisabled);
//     the SDK README says so in as many words. Every Fixed deploy would have
//     ended on a signature the contract was always going to refuse.
export async function createPool(args: CreatePoolArgs): Promise<CreatePoolResult> {
  const backend = createBackend();
  const ctor = toConstructorArgs(args.draft, args.creator, args.metaFor);
  const meta = {
    feeBps: percentToBps(args.draft.feePct),
    protocolSharePct: PROTOCOL_SHARE_PCT,
  };

  let result: Omit<CreatePoolResult, "aRight">;
  if (backend === "factory") {
    result = await createViaFactory(ctor, args.creator, args.onPhase);
  } else if (backend === "deploy") {
    result = await deployDirect(ctor, args.creator, args.onPhase);
  } else {
    result = await createDemo(ctor, args.onPhase);
  }

  const local = localPoolFromArgs(result.address, ctor, args.label, backend, result.hash, {
    ...meta,
    poolId: result.poolId,
  });
  useLocalPools.getState().add(local);
  invalidateVaults();
  invalidateVaultTvl();

  return { ...result, aRight: args.draft.aRight };
}

// ── Backends ─────────────────────────────────────────────────────────────

// Ask the Router to build the pool. One call does all of it: it deploys from
// the WASM it holds, writes itself in as protocol_controller, applies its own
// fee defaults, registers the pool under the next id and returns its address.
//
// The pool id is what this path is for, and the contract does not return it, so
// it is read around the call: `next_pool_id()` before is the id this pool will
// take, and `pool_at()` after confirms it rather than trusting the arithmetic.
// If someone else's pool lands in between, the check fails and the id is left
// undefined; the pool exists either way, and an unknown id costs a re-read, not
// a pool.
async function createViaFactory(
  ctor: ReturnType<typeof toConstructorArgs>,
  creator: string,
  onPhase?: OnPhase,
): Promise<Omit<CreatePoolResult, "aRight">> {
  onPhase?.("preparing");
  const signer = await getWalletSigner();
  const router = await routerClient(creator, {
    signAuthEntry: signer.signAuthEntry,
    signTransaction: async (...a: Parameters<typeof signer.signTransaction>) => {
      onPhase?.("signing");
      const res = await signer.signTransaction(...a);
      onPhase?.("submitting");
      return res;
    },
  });

  const expectedId = (await router.next_pool_id()).result;
  const tx = await router.create_pool(toRouterArgs(ctor));
  const sent = await tx.signAndSend();
  const address = sent.result;

  let poolId: number | undefined;
  try {
    const at = (await router.pool_at({ id: Number(expectedId) })).result;
    if (at === address) poolId = Number(expectedId);
  } catch {
    // The registry read is a confirmation, not part of creating the pool.
  }

  return {
    address,
    hash: sent.sendTransactionResponse?.hash ?? "",
    backend: "factory",
    poolId,
  };
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
