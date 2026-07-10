import { getWalletSigner } from "../../store/useAppStore";
import {
  NETWORK_PASSPHRASE,
  POOL_CONTRACT_ID,
  RPC_URL,
  TOKENS,
} from "./config";
import { fromRawUnits } from "./units";
import type { OnPhase, TxResult } from "./types";

// The LP share token (SLP) uses 9 decimals per the contract docs.
export const LP_DECIMALS = 9;

export interface PoolToken {
  /** Canonical index in the pool's token order (from get_tokens()). */
  index: number;
  address: string;
  symbol: string;
  decimals: number;
  /** Reserve in raw on-chain units. */
  reserve: bigint;
  /** Reserve scaled to human units (stablecoins ≈ $1). */
  reserveHuman: number;
  /** This token's share of total pool TVL, 0–100. */
  share: number;
}

export interface PoolState {
  tokens: PoolToken[];
  /** Effective amplification factor A (reflects any live ramp). */
  amp: number;
  paused: boolean;
  lpSupply: bigint;
  lpSupplyHuman: number;
  /** Sum of reserves in human units (stablecoins ≈ $1). */
  totalTvl: number;
  owner: string | undefined;
}

// The SDK re-exports @stellar/stellar-sdk, which is heavy and SSR-hostile, so we
// import it dynamically — it only ever runs in the browser.
async function loadSdk() {
  return import("@spreadless-dex/sdk");
}

// Read-only client: no publicKey/signer needed, view calls just simulate.
async function readClient() {
  const sdk = await loadSdk();
  return new sdk.Client({
    contractId: POOL_CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
}

// Write client: needs a connected wallet, since it's both the simulation's
// source account and, for the real submit, the signer. The signer is wrapped
// so callers can surface the tx lifecycle: signTransaction being invoked is
// the moment the wallet pops up ("signing"); it resolving means the signed tx
// is on its way to the network ("submitting").
async function writeClient(to: string, onPhase?: OnPhase) {
  const sdk = await loadSdk();
  const signer = await getWalletSigner();
  return new sdk.Client({
    contractId: POOL_CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: to,
    signAuthEntry: signer.signAuthEntry,
    signTransaction: async (...args: Parameters<typeof signer.signTransaction>) => {
      onPhase?.("signing");
      const res = await signer.signTransaction(...args);
      onPhase?.("submitting");
      return res;
    },
  });
}

// Simulated calls are typed as AssembledTransaction<i128>, but when the
// simulation hits a contract failure (e.g. quoting a deposit above the
// wallet's balance) the SDK hands back a Rust-style Err object instead of
// throwing — String(it) is "[object Object]" and it would flow straight into
// the UI. Normalize: unwrap Result-likes so callers get a real value or a
// real throw.
function unwrapResult<T>(value: T | { unwrap(): T }): T {
  if (
    value !== null &&
    typeof value === "object" &&
    "unwrap" in value &&
    typeof (value as { unwrap?: unknown }).unwrap === "function"
  ) {
    return (value as { unwrap(): T }).unwrap();
  }
  return value as T;
}

// The pool contract IS the LP token (SLP, 9 decimals) — it implements the
// fungible token trait alongside the StableSwap logic, so its balance is
// read the same way as any token's, via the pool's own client.
export async function getLpBalance(address: string): Promise<bigint> {
  const pool = await readClient();
  const { result } = await pool.balance({ account: address });
  return unwrapResult(result);
}

// Map an on-chain token address to display metadata. Falls back gracefully if
// the pool was redeployed with an address not in our config.
function metaFor(address: string) {
  const t = TOKENS.find((token) => token.contractId === address);
  return {
    symbol: t?.symbol ?? `${address.slice(0, 4)}…${address.slice(-4)}`,
    decimals: t?.decimals ?? 7,
  };
}

export async function readPoolState(): Promise<PoolState> {
  const pool = await readClient();

  // Each call returns an AssembledTransaction; .result holds the simulated view.
  const [tokens, reserves, amp, paused, lpSupply, owner] = await Promise.all([
    pool.get_tokens().then((t) => t.result),
    pool.get_reserves().then((t) => t.result),
    pool.get_amp().then((t) => t.result),
    pool.paused().then((t) => t.result),
    pool.total_supply().then((t) => t.result),
    pool.get_owner().then((t) => t.result),
  ]);

  // console.log(tokens, "Tokens");
  // console.log(reserves, "reserves");
  // console.log(amp, "amp");
  // console.log(owner, "owner");
  // console.log(lpSupply, "supply");

  const humanReserves = tokens.map((address, i) => {
    const { decimals } = metaFor(address);
    return Number(fromRawUnits(reserves[i] ?? 0n, decimals));
  });
  const totalTvl = humanReserves.reduce((sum, v) => sum + v, 0);

  const poolTokens: PoolToken[] = tokens.map((address, i) => {
    const { symbol, decimals } = metaFor(address);
    const reserveHuman = humanReserves[i];
    return {
      index: i,
      address,
      symbol,
      decimals,
      reserve: reserves[i] ?? 0n,
      reserveHuman,
      share: totalTvl > 0 ? (reserveHuman / totalTvl) * 100 : 0,
    };
  });

  return {
    tokens: poolTokens,
    amp,
    paused,
    lpSupply,
    lpSupplyHuman: Number(fromRawUnits(lpSupply, LP_DECIMALS)),
    totalTvl,
    owner,
  };
}

interface DepositArgs {
  /** Recipient + signer. Must be the connected wallet's public key. */
  to: string;
  /** Canonical index of the token being deposited. */
  tokenIndex: number;
  /** Amount in raw on-chain units of that token. */
  amount: bigint;
  /** Slippage tolerance in basis points (100 = 1%). */
  toleranceBps?: bigint;
  /** Called as the tx moves through its lifecycle (preparing → signing → submitting). */
  onPhase?: OnPhase;
}

/** Simulate-only: how many LP shares this single-sided deposit would mint right now. */
export async function quoteDepositSingleSided({
  to,
  tokenIndex,
  amount,
}: Omit<DepositArgs, "toleranceBps" | "onPhase">): Promise<bigint> {
  if (amount <= 0n) return 0n;
  const pool = await writeClient(to);
  const tokens = (await pool.get_tokens()).result;
  const amounts_in = tokens.map((_, i) => (i === tokenIndex ? amount : 0n));
  const quote = await pool.deposit({ to, amounts_in, min_lp_out: 0n });
  return unwrapResult(quote.result);
}

/** Single-sided deposit: fund one token, receive LP shares. Returns LP minted. */
export async function depositSingleSided({
  to,
  tokenIndex,
  amount,
  toleranceBps = 100n,
  onPhase,
}: DepositArgs): Promise<TxResult<bigint>> {
  onPhase?.("preparing");
  const pool = await writeClient(to, onPhase);

  // amounts_in is indexed by canonical token order; single-sided means our
  // amount at this token's slot and 0 everywhere else.
  const tokens = (await pool.get_tokens()).result;
  const amounts_in = tokens.map((_, i) => (i === tokenIndex ? amount : 0n));

  // Simulate once with no floor to read the quoted LP, then submit with
  // min_lp_out set from that quote minus tolerance — on-chain slippage guard.
  const quote = await pool.deposit({ to, amounts_in, min_lp_out: 0n });
  const quotedLp = unwrapResult(quote.result);
  const minLpOut = quotedLp - (quotedLp * toleranceBps) / 10_000n;

  const tx = await pool.deposit({ to, amounts_in, min_lp_out: minLpOut });
  const sent = await tx.signAndSend();
  return { result: unwrapResult(sent.result), hash: sent.sendTransactionResponse?.hash ?? "" };
}

interface SwapArgs {
  /** Recipient of token_out + signer. Must be the connected wallet's public key. */
  to: string;
  /** Contract address of the token being sold. */
  tokenIn: string;
  /** Contract address of the token being bought. */
  tokenOut: string;
  /** Amount of tokenIn in raw on-chain units. */
  amountIn: bigint;
  /** Slippage tolerance in basis points (100 = 1%). */
  toleranceBps?: bigint;
  /** Called as the tx moves through its lifecycle (preparing → signing → submitting). */
  onPhase?: OnPhase;
}

/** Simulate-only: how much tokenOut this swap would yield right now. */
export async function quoteSwapExactIn({
  to,
  tokenIn,
  tokenOut,
  amountIn,
}: Omit<SwapArgs, "toleranceBps" | "onPhase">): Promise<bigint> {
  if (amountIn <= 0n) return 0n;
  const pool = await writeClient(to);
  const quote = await pool.swap_exact_in({
    to,
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    min_out: 0n,
  });
  return unwrapResult(quote.result);
}

/** Swap an exact amount of tokenIn for tokenOut. Returns the tokenOut received. */
export async function swapExactIn({
  to,
  tokenIn,
  tokenOut,
  amountIn,
  toleranceBps = 100n,
  onPhase,
}: SwapArgs): Promise<TxResult<bigint>> {
  onPhase?.("preparing");
  const pool = await writeClient(to, onPhase);

  // Same two-phase pattern as depositSingleSided: simulate for the quote,
  // then submit for real with an on-chain slippage floor.
  const quote = await pool.swap_exact_in({
    to,
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    min_out: 0n,
  });
  const quotedOut = unwrapResult(quote.result);
  const minOut = quotedOut - (quotedOut * toleranceBps) / 10_000n;

  const tx = await pool.swap_exact_in({
    to,
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    min_out: minOut,
  });
  const sent = await tx.signAndSend();
  return { result: unwrapResult(sent.result), hash: sent.sendTransactionResponse?.hash ?? "" };
}

interface WithdrawArgs {
  /** Recipient of the withdrawn token + signer. Must be the connected wallet's public key. */
  to: string;
  /** Contract address of the token to exit into. */
  tokenOut: string;
  /** LP shares to burn, in raw units (9 decimals). */
  lpAmount: bigint;
  /** Slippage tolerance in basis points (100 = 1%). */
  toleranceBps?: bigint;
  /** Called as the tx moves through its lifecycle (preparing → signing → submitting). */
  onPhase?: OnPhase;
}

/** Simulate-only: how much of tokenOut burning lpAmount shares would pay out. */
export async function quoteWithdrawOneToken({
  to,
  tokenOut,
  lpAmount,
}: Omit<WithdrawArgs, "toleranceBps" | "onPhase">): Promise<bigint> {
  if (lpAmount <= 0n) return 0n;
  const pool = await writeClient(to);
  const quote = await pool.withdraw_one_token({
    to,
    lp_amount: lpAmount,
    token_out: tokenOut,
    min_amount_out: 0n,
  });
  return unwrapResult(quote.result);
}

/** Burn lpAmount LP shares and exit entirely into tokenOut. Returns the amount received. */
export async function withdrawOneToken({
  to,
  tokenOut,
  lpAmount,
  toleranceBps = 100n,
  onPhase,
}: WithdrawArgs): Promise<TxResult<bigint>> {
  onPhase?.("preparing");
  const pool = await writeClient(to, onPhase);

  // Same two-phase pattern as deposit/swap: simulate for the quote, then
  // submit for real with an on-chain slippage floor.
  const quote = await pool.withdraw_one_token({
    to,
    lp_amount: lpAmount,
    token_out: tokenOut,
    min_amount_out: 0n,
  });
  const quotedOut = unwrapResult(quote.result);
  const minAmountOut = quotedOut - (quotedOut * toleranceBps) / 10_000n;

  const tx = await pool.withdraw_one_token({
    to,
    lp_amount: lpAmount,
    token_out: tokenOut,
    min_amount_out: minAmountOut,
  });
  const sent = await tx.signAndSend();
  return { result: unwrapResult(sent.result), hash: sent.sendTransactionResponse?.hash ?? "" };
}
