/** Outcome of a submitted (signed + sent) contract call. */
export interface TxResult<T> {
  result: T;
  /** Transaction hash, for linking out to a block explorer. Empty if the SDK didn't report one. */
  hash: string;
}

/**
 * Where a write call currently is in its lifecycle:
 * - `preparing`  — simulating the call to get a quote / build the tx
 * - `signing`    — the wallet is open, waiting for the user to approve
 * - `submitting` — signed, waiting for the network to confirm
 */
export type TxPhase = "preparing" | "signing" | "submitting";

export type OnPhase = (phase: TxPhase) => void;
