// Best-effort classification of a failed tx's error message. We can't build a
// real trustline-add operation here (that needs the classic asset's code +
// issuer, which isn't in config.ts for SAC-wrapped tokens like SUSD) — so this
// is used to swap a generic "Transaction failed" for guidance the user can
// actually act on in their wallet.
export function isTrustlineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /trust/i.test(msg);
}

export function trustlineGuidance(symbol: string): string {
  return `Your wallet doesn't have a trustline for ${symbol} yet. Open your wallet (e.g. Freighter) and add a trustline for ${symbol}, then try again.`;
}
