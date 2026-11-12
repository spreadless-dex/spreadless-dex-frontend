// The shared half of the /api routes: where to read from, and how to answer.

import { env } from "cloudflare:workers";
import { IS_MAINNET, RPC_URL } from "../stellar/config";
import { MARKET_STALE_SECONDS, MARKET_TTL_SECONDS, readMarket, type Market } from "./market";

// Mainnet has no default a Worker could use: RPC_URL there is this app's own
// /rpc route, so the provider URL comes from the same secret that route uses.
export function rpcUrl(): string | undefined {
  const secret = (env as { SOROBAN_RPC_URL?: string }).SOROBAN_RPC_URL;
  return secret || (IS_MAINNET ? undefined : RPC_URL);
}

// readMarket's own cache lives in one isolate, and a Worker runs many. The
// snapshot also goes into the data center's cache, so a fresh isolate neither
// spends the provider's burst on a read another one just did, nor has nothing
// to show when its own read fails. Not a public route: only this code reads it.
const SNAPSHOT_PATH = "/__market-snapshot";

const edgeCache = (): Cache | undefined =>
  typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;

const ageSeconds = (market: Market) => (Date.now() - Date.parse(market.updatedAt)) / 1000;

async function sharedMarket(url: string, origin: string): Promise<Market> {
  const cache = edgeCache();
  const key = new Request(origin + SNAPSHOT_PATH);
  const shared = await cache
    ?.match(key)
    .then((res) => (res ? (res.json() as Promise<Market>) : undefined))
    .catch(() => undefined);
  if (shared && ageSeconds(shared) < MARKET_TTL_SECONDS) return shared;

  try {
    const market = await readMarket(url);
    if (cache && market.updatedAt !== shared?.updatedAt) {
      const body = new Response(JSON.stringify(market), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${MARKET_STALE_SECONDS}` },
      });
      await cache.put(key, body).catch((err) => console.warn("Market snapshot not cached:", err));
    }
    return market;
  } catch (err) {
    if (shared && ageSeconds(shared) < MARKET_STALE_SECONDS) {
      console.warn("Market read failed, serving the shared snapshot:", err);
      return shared;
    }
    throw err;
  }
}

export async function marketResponse(body: (market: Market) => unknown, origin: string): Promise<Response> {
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
  try {
    const url = rpcUrl();
    if (!url) throw new Error("SOROBAN_RPC_URL is not configured");
    const market = await sharedMarket(url, origin);
    return new Response(JSON.stringify(body(market)), {
      headers: { ...headers, "cache-control": `public, max-age=${MARKET_TTL_SECONDS}` },
    });
  } catch (err) {
    console.error("Market read failed:", err);
    return new Response(JSON.stringify({ error: "Market data is unavailable right now." }), {
      status: 503,
      headers: { ...headers, "cache-control": "no-store" },
    });
  }
}
