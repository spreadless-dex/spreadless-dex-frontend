// A typed client for the Router contract, built from the spec in its deployed
// WASM. Three files carry the Router's name and they do different things:
//
//   router.ts          off-chain pathfinder. Which hops, no contract at all.
//   routerContract.ts  the execution half: turns a route into one signed call.
//   routerClient.ts    this file. The contract itself, every method, no policy.
//
// There is no generated binding for this contract: `@spreadless-dex/sdk`
// publishes the pool Client and nothing else. It turns out none is needed. A
// Soroban contract carries its own spec, and `contract.Client.from()` reads it
// off the network and returns a client with every method on it. That is the
// same mechanism the generated package uses, minus the codegen step.
//
// So the interface below is not a guess. It is the spec as deployed, read on
// 2026-09-09 from CA4VB4SJ… and reproducible with:
//
//   const c = await contract.Client.from({ contractId, rpcUrl, networkPassphrase })
//   c.spec.funcs().map(f => f.name().toString())
//
// What TypeScript cannot know is the shape, since the client is assembled at
// runtime, hence the hand-written interface. If the contract is redeployed with
// a different signature the mismatch shows up as a failing simulation rather
// than a type error, so check against the spec before blaming the call.

import { contract } from "@stellar/stellar-sdk";
import { FACTORY_CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from "./config";
import type { AmpControl } from "./poolParams";
import { ROUTER_SPEC_CONTRACT_ID, ROUTER_SPEC_XDR } from "./routerSpec";

export interface RouterCreatePoolArgs {
  /** Signs the call and becomes the new pool's owner. */
  creator: string;
  /** Strictly ascending. */
  tokens: string[];
  amp_factor: number;
  amp_control: AmpControl;
  swap_fee: bigint;
  max_caps: bigint[];
  lp_max_supply: bigint;
  lp_name: string;
  lp_symbol: string;
}

/**
 * The Router's methods, as deployed. Only what the app calls is listed; the
 * contract also carries its own Ownable pair, `set_pool_wasm_hash`,
 * `pause_pool`/`unpause_pool`, `set_pool_amp_ramp`, `set_pool_beneficiary`,
 * `set_pool_protocol_fee` and the two `default_protocol_*` settings, all of
 * them the Router owner's and none of them ours to call from a browser.
 */
export interface RouterClient {
  /** Deploys a pool, registers it under the next id, returns its address. */
  create_pool: (
    args: RouterCreatePoolArgs,
    opts?: contract.MethodOptions,
  ) => Promise<contract.AssembledTransaction<string>>;
  /** The registered pool at `id`, or undefined past the end. */
  pool_at: (
    args: { id: number },
    opts?: contract.MethodOptions,
  ) => Promise<contract.AssembledTransaction<string | undefined>>;
  /** The id the next created pool will take, so also the count of pools. */
  next_pool_id: (opts?: contract.MethodOptions) => Promise<contract.AssembledTransaction<number>>;
  /** The pool WASM the Router deploys from. Cross-check for POOL_WASM_HASH. */
  get_pool_wasm_hash: (opts?: contract.MethodOptions) => Promise<contract.AssembledTransaction<Buffer>>;
  /** The default cut of the swap fee written into every pool it creates, 1e9 = 100%. */
  get_default_protocol_fee: (opts?: contract.MethodOptions) => Promise<contract.AssembledTransaction<bigint>>;
  /**
   * Atomic multi-hop. `to` is the signer, the payer of `token_in` and the
   * recipient of the last hop's output: the contract has no separate recipient
   * argument, and no deadline argument either. Legs are named by registry id,
   * so it can only ever reach pools the Router itself created.
   */
  swap_exact_in: (
    args: { to: string; token_in: string; path: SwapHop[]; amount_in: bigint; min_out: bigint },
    opts?: contract.MethodOptions,
  ) => Promise<contract.AssembledTransaction<bigint>>;
}

/**
 * One leg of a route, as `swap_exact_in` takes it. A leg says which pool and
 * what to buy; what it sells is the previous leg's output, or `token_in` for
 * the first, which is why the struct has no `token_in` of its own.
 */
export interface SwapHop {
  /** The pool's Router registry id, the `id` of `pool_at`. */
  pool_id: number;
  token_out: string;
}

export interface RouterSigner {
  signTransaction: contract.ClientOptions["signTransaction"];
  signAuthEntry: contract.ClientOptions["signAuthEntry"];
}

// The spec never changes for a given deployment. For the configured Router it
// ships in routerSpec.ts, so building a client costs no network at all; any
// other id is read off the chain once per session, as before. Either way every
// client is local: `new Client(spec, options)` is the same constructor the
// generated package calls.
let specPromise: Promise<contract.Spec> | null = null;

function routerId(): string {
  if (!FACTORY_CONTRACT_ID) {
    throw new Error("Router is not configured. Set FACTORY_CONTRACT_ID in src/lib/stellar/config.ts.");
  }
  return FACTORY_CONTRACT_ID;
}

async function routerSpec(): Promise<contract.Spec> {
  if (!specPromise && routerId() === ROUTER_SPEC_CONTRACT_ID) {
    specPromise = Promise.resolve(new contract.Spec([...ROUTER_SPEC_XDR]));
  }
  if (!specPromise) {
    specPromise = contract.Client.from({
      contractId: routerId(),
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .then((c) => c.spec)
      .catch((err) => {
        // A failed fetch must not poison the session: the next call retries.
        specPromise = null;
        throw err;
      });
  }
  return specPromise;
}

/**
 * A Router client. Pass a `publicKey` to simulate as that account, and a signer
 * as well to be able to submit. Views need neither.
 */
export async function routerClient(publicKey?: string, signer?: RouterSigner): Promise<RouterClient> {
  const spec = await routerSpec();
  return new contract.Client(spec, {
    contractId: routerId(),
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey,
    ...signer,
  }) as unknown as RouterClient;
}

/** Every pool id the Router has handed out, in order. Empty on a fresh registry. */
export async function listPoolIds(client: RouterClient): Promise<number[]> {
  const next = (await client.next_pool_id()).result;
  return Array.from({ length: Number(next) }, (_, i) => i);
}
