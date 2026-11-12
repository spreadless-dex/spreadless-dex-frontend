// Keeping the server's RPC calls under the provider's burst limit.
//
// The mainnet provider answers 429 once about 30 calls arrive at once (25 in
// parallel pass, 40 do not). A market snapshot is close to 40 calls, and a
// Worker fires them faster than Node does, so an unthrottled read failed every
// time on Cloudflare while it passed locally.

/** How many calls one read keeps in flight. Leaves room for the cron and /rpc. */
export const MAX_IN_FLIGHT = 5;

/** Waits before each retry of a rate-limited call. */
export const RETRY_DELAYS_MS = [250, 750, 2000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for the provider's 429, as the SDK's axios client throws it. */
export function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.response?.status === 429 || e?.status === 429;
}

/** Runs `fn`, and again after a pause when the provider says slow down. */
export async function rpcCall<T>(fn: () => Promise<T>, delays: readonly number[] = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimited(err) || attempt >= delays.length) throw err;
      await sleep(delays[attempt]);
    }
  }
}

/** `Promise.all(items.map(fn))`, but with at most `limit` calls running. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
