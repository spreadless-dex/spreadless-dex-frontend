/** Outcome of a submitted (signed + sent) contract call. */
export interface TxResult<T> {
  result: T;
  /** Transaction hash, for linking out to a block explorer. Empty if the SDK didn't report one. */
  hash: string;
}
