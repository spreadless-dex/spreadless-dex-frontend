// The shared half of the /api routes: where to read from, and how to answer.

import { env } from "cloudflare:workers";
import { IS_MAINNET, RPC_URL } from "../stellar/config";
import { MARKET_TTL_SECONDS, readMarket, type Market } from "./market";

// Mainnet has no default a Worker could use: RPC_URL there is this app's own
// /rpc route, so the provider URL comes from the same secret that route uses.
export function rpcUrl(): string | undefined {
  const secret = (env as { SOROBAN_RPC_URL?: string }).SOROBAN_RPC_URL;
  return secret || (IS_MAINNET ? undefined : RPC_URL);
}

export async function marketResponse(body: (market: Market) => unknown): Promise<Response> {
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
  try {
    const url = rpcUrl();
    if (!url) throw new Error("SOROBAN_RPC_URL is not configured");
    const market = await readMarket(url);
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
