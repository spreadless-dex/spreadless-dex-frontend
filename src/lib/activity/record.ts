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
}

// Returns the record that was saved — callers that need to jump straight to
// the detail drawer (e.g. the post-swap "View Details" button) can use it
// without a round-trip back through IndexedDB.
export async function recordSwap(args: RecordSwapArgs): Promise<ActivityRecord> {
  const failed = args.status === "failed";
  const record = build({
    walletAddress: args.walletAddress,
    type: "swap",
    status: args.status,
    title: `Swap ${args.fromSymbol} → ${args.toSymbol}`,
    subtitle: failed
      ? (args.detail ?? "No assets exchanged")
      : args.effectiveRate !== undefined
        ? `Rate ${args.effectiveRate.toFixed(4)}`
        : "",
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
