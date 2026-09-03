import { addActivity, type ActivityRecord, type ActivityStatus } from "./db";
import { explorerTxUrl } from "../stellar/config";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function build(
  fields: Omit<ActivityRecord, "id" | "timestamp" | "explorerUrl">,
): ActivityRecord {
  return {
    id: newId(),
    timestamp: Date.now(),
    explorerUrl: fields.txHash ? explorerTxUrl(fields.txHash) : undefined,
    ...fields,
  };
}

interface RecordSwapArgs {
  walletAddress: string;
  status: ActivityStatus;
  fromSymbol: string;
  toSymbol: string;
  sentAmount: string;
  receivedAmount?: string;
  effectiveRate?: number;
  slippage?: string;
  txHash?: string;
  detail?: string;
  /** Token path for a routed swap; omitted for a direct one. */
  route?: string;
  hops?: number;
}

// Returns the record that was saved — callers that need to jump straight to
// the detail drawer (e.g. the post-swap "View Details" button) can use it
// without a round-trip back through IndexedDB.
export async function recordSwap(args: RecordSwapArgs): Promise<ActivityRecord> {
  const failed = args.status === "failed";
  const routed = (args.hops ?? 1) > 1;
  const record = build({
    walletAddress: args.walletAddress,
    type: "swap",
    status: args.status,
    title: `Swap ${args.fromSymbol} → ${args.toSymbol}`,
    subtitle: failed
      ? (args.detail ?? "No assets exchanged")
      : args.effectiveRate !== undefined
        ? routed
          ? `Rate ${args.effectiveRate.toFixed(4)} · ${args.hops} hops, atomic`
          : `Rate ${args.effectiveRate.toFixed(4)}`
        : "",
    route: args.route,
    hops: args.hops,
    assetPool: `${args.fromSymbol}/${args.toSymbol}`,
    amount: `${args.sentAmount} ${args.fromSymbol}`,
    sent: `${args.sentAmount} ${args.fromSymbol}`,
    received: args.receivedAmount ? `${args.receivedAmount} ${args.toSymbol}` : undefined,
    effectiveRate: args.effectiveRate,
    slippage: args.slippage,
    txHash: args.txHash,
    detail: failed ? args.detail : undefined,
  });
  await addActivity(record);
  return record;
}

interface RecordDepositArgs {
  walletAddress: string;
  status: ActivityStatus;
  symbol: string;
  amount: string;
  lpReceived?: string;
  txHash?: string;
  detail?: string;
}

export async function recordDeposit(args: RecordDepositArgs): Promise<ActivityRecord> {
  const failed = args.status === "failed";
  const record = build({
    walletAddress: args.walletAddress,
    type: "deposit",
    status: args.status,
    title: `Deposit ${args.symbol}`,
    subtitle: failed ? (args.detail ?? "No assets exchanged") : "Single-sided stable pool",
    assetPool: args.symbol,
    amount: `${args.amount} ${args.symbol}`,
    sent: `${args.amount} ${args.symbol}`,
    received: args.lpReceived ? `${args.lpReceived} LP` : undefined,
    txHash: args.txHash,
    detail: failed ? args.detail : undefined,
  });
  await addActivity(record);
  return record;
}

interface RecordWithdrawArgs {
  walletAddress: string;
  status: ActivityStatus;
  symbol: string;
  lpBurned: string;
  amountReceived?: string;
  txHash?: string;
  detail?: string;
}

export async function recordWithdraw(args: RecordWithdrawArgs): Promise<ActivityRecord> {
  const failed = args.status === "failed";
  const record = build({
    walletAddress: args.walletAddress,
    type: "withdraw",
    status: args.status,
    title: `Withdraw ${args.symbol}`,
    subtitle: failed
      ? (args.detail ?? "No assets exchanged")
      : args.amountReceived
        ? `Received ${args.amountReceived} ${args.symbol}`
        : "",
    assetPool: args.symbol,
    amount: args.amountReceived ? `${args.amountReceived} ${args.symbol}` : `${args.lpBurned} LP`,
    sent: `${args.lpBurned} LP`,
    received: args.amountReceived ? `${args.amountReceived} ${args.symbol}` : undefined,
    txHash: args.txHash,
    detail: failed ? args.detail : undefined,
  });
  await addActivity(record);
  return record;
}

interface RecordOwnershipArgs {
  walletAddress: string;
  status: ActivityStatus;
  /** Which step of the handover this was. */
  step: "offer" | "withdraw" | "accept" | "renounce";
  poolLabel: string;
  poolAddress: string;
  /** The other party: recipient for an offer, previous owner for an accept. */
  counterparty?: string;
  txHash?: string;
  detail?: string;
}

// Ownership moves in two signed steps (offer, accept) plus an optional
// withdrawal, so each one gets its own entry: the history then reads like
// the handover actually happened, not like one event with a hidden middle.
export async function recordOwnership(args: RecordOwnershipArgs): Promise<ActivityRecord> {
  const failed = args.status === "failed";
  const short = (a?: string) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "");
  const title =
    args.step === "offer"
      ? `Ownership offered · ${args.poolLabel}`
      : args.step === "withdraw"
        ? `Offer withdrawn · ${args.poolLabel}`
        : args.step === "renounce"
          ? `Ownership given up · ${args.poolLabel}`
          : `Ownership accepted · ${args.poolLabel}`;
  const subtitle = failed
    ? (args.detail ?? "Nothing changed")
    : args.step === "offer"
      ? `To ${short(args.counterparty)} · open for 7 days`
      : args.step === "withdraw"
        ? "The pool stays with you"
        : args.step === "renounce"
          ? "A, fee and pause are fixed for good"
          : "You are the owner now";
  const record = build({
    walletAddress: args.walletAddress,
    type: "ownership",
    status: args.status,
    title,
    subtitle,
    assetPool: args.poolLabel,
    amount: short(args.poolAddress),
    sent: args.step === "offer" ? `Offer to ${short(args.counterparty)}` : undefined,
    received: args.step === "accept" ? `Pool ${short(args.poolAddress)}` : undefined,
    txHash: args.txHash,
    detail: failed ? args.detail : undefined,
  });
  await addActivity(record);
  return record;
}
