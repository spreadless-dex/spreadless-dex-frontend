// The atomic Router: one transaction, N hops, all or nothing.
//
// This is the execution half of Tranche 2 / D2. The pathfinder (router.ts)
// decides *which* hops; this module turns them into a single Router
// invocation, simulates it, collects the authorization footprint, signs
// through the wallet and submits.
//
// PROVISIONAL INTERFACE. The Router contract is not deployed and its ABI is
// not final. Everything that depends on the contract's exact shape lives in
// the two functions marked ROUTER ABI below (`routeArgs` and `decodeRouteResult`)
// so the day the contract lands, that is the whole diff. The doc's argument
// list is followed literally: user, recipient, input token, input amount,
// final output token, minimum final output, deadline, ordered hops.
//
// While ROUTER_CONTRACT_ID is null, a multi-hop route can only execute in the
// routing demo (see demo.ts), where these phases are staged locally and
// nothing is signed.

import { getWalletSigner } from "../../store/useAppStore";
import { NETWORK_PASSPHRASE, ROUTER_CONTRACT_ID, RPC_URL } from "./config";
import { DEMO_STEP_MS, DEMO_TX_HASH, isDemoVault, useRoutingDemo } from "./demo";
import type { RouteCandidate } from "./router";
import type { OnPhase, TxResult } from "./types";

/**
 * How long a signed route stays valid. Short on purpose: a route was chosen
 * against reserves that existed at quote time, and the deadline is what stops
 * a transaction that sat in a wallet from settling against a different market.
 * The same number bounds the transaction itself (time bounds), so the two can
 * never disagree.
 */
export const ROUTE_DEADLINE_SECS = 180;

export interface ExecuteRouteArgs {
  /** The connected wallet: pays the input, signs, and is the tx source. */
  user: string;
  /** Where the final output goes. Defaults to `user`. */
  recipient?: string;
  candidate: RouteCandidate;
  amountIn: bigint;
  /**
   * Route-level floor on the *final* output, in raw units. Derived from the
   * quote the user saw minus their tolerance, never from a fresh simulation:
   * intermediate amounts are deliberately unprotected (the Router holds them
   * for the duration of one transaction), only the end of the route is.
   */
  minOut: bigint;
  onPhase?: OnPhase;
}

export class RouteExecutionError extends Error {
  constructor(
    message: string,
    /** 1-based index of the hop the Router reported, when it reported one. */
    readonly failedHop: number | null,
  ) {
    super(message);
    this.name = "RouteExecutionError";
  }
}

/** True when this route can be signed right now, in any mode. */
export function canExecuteRoute(candidate: RouteCandidate): boolean {
  if (candidate.hops.length <= 1) return true;
  if (ROUTER_CONTRACT_ID) return true;
  return useRoutingDemo.getState().enabled && candidate.hops.some((h) => isDemoVault(h.vault));
}

/** Whether this route runs through the local demo instead of the chain. */
export function isDemoRoute(candidate: RouteCandidate): boolean {
  return candidate.hops.some((h) => isDemoVault(h.vault));
}

export async function executeRoute(args: ExecuteRouteArgs): Promise<TxResult<bigint>> {
  if (isDemoRoute(args.candidate)) return executeDemoRoute(args);
  if (!ROUTER_CONTRACT_ID) {
    throw new RouteExecutionError(
      "The multi-hop Router is not deployed on this network yet.",
      null,
    );
  }
  return executeOnChain(ROUTER_CONTRACT_ID, args);
}

// ── On-chain path ────────────────────────────────────────────────────────

type Sdk = typeof import("@stellar/stellar-sdk");

// ROUTER ABI: the argument vector for `route(...)`. A hop is encoded as a
// struct {pool, token_in, token_out}; Soroban serialises structs as maps with
// symbol keys in sorted order, which is why the keys below are alphabetical.
function routeArgs(
  sdk: Sdk,
  a: Required<Pick<ExecuteRouteArgs, "user" | "recipient" | "candidate" | "amountIn" | "minOut">>,
  deadlineUnix: number,
) {
  const { Address, nativeToScVal, xdr } = sdk;
  const address = (s: string) => new Address(s).toScVal();
  const sym = (s: string) => xdr.ScVal.scvSymbol(s);
  const hops = xdr.ScVal.scvVec(
    a.candidate.hops.map((h) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: sym("pool"), val: address(h.vault) }),
        new xdr.ScMapEntry({ key: sym("token_in"), val: address(h.tokenIn) }),
        new xdr.ScMapEntry({ key: sym("token_out"), val: address(h.tokenOut) }),
      ]),
    ),
  );
  const first = a.candidate.hops[0];
  const last = a.candidate.hops[a.candidate.hops.length - 1];
  return [
    address(a.user),
    address(a.recipient),
    address(first.tokenIn),
    nativeToScVal(a.amountIn, { type: "i128" }),
    address(last.tokenOut),
    nativeToScVal(a.minOut, { type: "i128" }),
    nativeToScVal(deadlineUnix, { type: "u64" }),
    hops,
  ];
}

// ROUTER ABI: `route` returns the final output amount as i128.
function decodeRouteResult(sdk: Sdk, value: InstanceType<Sdk["xdr"]["ScVal"]> | undefined): bigint {
  if (!value) return 0n;
  const native = sdk.scValToNative(value);
  return typeof native === "bigint" ? native : BigInt(native);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function executeOnChain(
  routerId: string,
  { user, recipient = user, candidate, amountIn, minOut, onPhase }: ExecuteRouteArgs,
): Promise<TxResult<bigint>> {
  onPhase?.("preparing");
  // Dynamic like every Stellar import here: the SDK touches browser globals
  // at module scope and breaks Astro's prerender if pulled into SSR.
  const sdk = await import("@stellar/stellar-sdk");
  const { Address, Contract, TransactionBuilder, BASE_FEE, rpc, xdr, authorizeEntry } = sdk;

  const server = new rpc.Server(RPC_URL);
  const account = await server.getAccount(user);
  const deadlineUnix = Math.floor(Date.now() / 1000) + ROUTE_DEADLINE_SECS;

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      new Contract(routerId).call(
        "route",
        ...routeArgs(sdk, { user, recipient, candidate, amountIn, minOut }, deadlineUnix),
      ),
    )
    // Same horizon as the contract-level deadline, see ROUTE_DEADLINE_SECS.
    .setTimeout(ROUTE_DEADLINE_SECS)
    .build();

  // Simulating the complete Router invocation is what yields the footprint
  // and the authorization tree: the user's transfer of the input token sits
  // *under* the Router call, not beside it.
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new RouteExecutionError(sim.error, hopFromError(sim.error));
  }

  // Authorization footprint. Because the user is also the transaction source,
  // the simulator normally returns source-account credentials for every entry
  // the user must approve, and the transaction signature covers them. Any
  // entry that instead carries address credentials for the user has to be
  // signed on its own, through the wallet, with a ledger bound that matches
  // the deadline.
  const signer = await getWalletSigner();
  const latest = await server.getLatestLedger();
  const validUntil = latest.sequence + Math.ceil(ROUTE_DEADLINE_SECS / 5) + 12;
  const auth = await Promise.all(
    (sim.result?.auth ?? []).map(async (entry) => {
      const creds = entry.credentials();
      if (creds.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) return entry;
      const who = Address.fromScAddress(creds.address().address()).toString();
      if (who !== user) return entry;
      return authorizeEntry(
        entry,
        async (preimage) => {
          const { signedAuthEntry } = await signer.signAuthEntry(preimage.toXDR("base64"), {
            address: user,
            networkPassphrase: NETWORK_PASSPHRASE,
          });
          return base64ToBytes(signedAuthEntry);
        },
        validUntil,
        NETWORK_PASSPHRASE,
      );
    }),
  );
  if (sim.result) sim.result.auth = auth;

  const assembled = rpc.assembleTransaction(tx, sim).build();

  onPhase?.("signing");
  const { signedTxXdr } = await signer.signTransaction(assembled.toXDR(), {
    address: user,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  onPhase?.("submitting");
  const signed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    const detail = sent.errorResult?.toXDR("base64") ?? sent.status;
    throw new RouteExecutionError(`Transaction rejected: ${detail}`, null);
  }

  const final = await server.pollTransaction(sent.hash, {
    attempts: Math.ceil(ROUTE_DEADLINE_SECS / 2),
    sleepStrategy: () => 2000,
  });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    const raw =
      "resultXdr" in final && final.resultXdr ? final.resultXdr.toXDR("base64") : final.status;
    throw new RouteExecutionError(`Route reverted: ${raw}`, hopFromError(raw));
  }
  return { result: decodeRouteResult(sdk, final.returnValue), hash: sent.hash };
}

// The Router is expected to name the hop in its error (the doc asks for a
// route execution event; the error path should carry the same index). Until
// the enum exists, recognise the obvious spellings.
function hopFromError(raw: string): number | null {
  const m = /hop\s*#?(\d+)/i.exec(raw);
  return m ? Number(m[1]) : null;
}

// ── Demo path ────────────────────────────────────────────────────────────
//
// Walks the same phases with the same timing feel and either "settles" with
// the quoted output or reverts at the leg the demo switch names. No wallet
// prompt: there is nothing real to sign.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function executeDemoRoute({
  user,
  candidate,
  amountIn,
  minOut,
  onPhase,
}: ExecuteRouteArgs): Promise<TxResult<bigint>> {
  const { quoteRoute } = await import("./router");
  onPhase?.("preparing");
  await wait(DEMO_STEP_MS.preparing);
  onPhase?.("signing");
  await wait(DEMO_STEP_MS.signing);
  onPhase?.("submitting");
  await wait(DEMO_STEP_MS.submitting);

  const failHop = useRoutingDemo.getState().failHop;
  if (failHop !== null && failHop >= 1 && failHop <= candidate.hops.length) {
    // Consume the switch so the next attempt goes through, which is the
    // natural "try again" story after a revert.
    useRoutingDemo.getState().setFailHop(null);
    throw new RouteExecutionError(
      `Route reverted at hop #${failHop}: HostError: Error(Contract, #12) SlippageExceeded`,
      failHop,
    );
  }

  // A demo route may still have a live leg (Vault A into the real pool), so
  // the re-quote runs against the real wallet, exactly like the search did.
  const { amountOut } = await quoteRoute(candidate, amountIn, user);
  if (amountOut < minOut) {
    throw new RouteExecutionError(
      `Route reverted: final output below minimum: Error(Contract, #12) SlippageExceeded`,
      candidate.hops.length,
    );
  }
  return { result: amountOut, hash: DEMO_TX_HASH };
}
