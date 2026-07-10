// After a transaction confirms, RPC reads (balance simulations) can briefly
// keep serving the pre-transaction snapshot — refetching immediately showed
// the old balance until a manual reload. Poll until the value moves away
// from what we already display, giving up after a few attempts (the value
// legitimately stays the same when e.g. a tx touched other tokens only).
export async function refetchUntilChanged(
  fetch: () => Promise<bigint>,
  previous: bigint | null,
  attempts = 5,
  delayMs = 1000,
): Promise<bigint> {
  let latest = previous ?? 0n;
  for (let i = 0; i < attempts; i++) {
    latest = await fetch();
    if (previous === null || latest !== previous) return latest;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return latest;
}
