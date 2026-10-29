// Soroban RPC proxy for the mainnet build (see RPC_URL in lib/stellar/config.ts).
//
// Mainnet has no free public Soroban RPC, and a provider URL shipped in the
// bundle is a key anyone can lift. So the browser posts its JSON-RPC calls
// here and this route forwards them to the provider URL held in the Worker
// secret SOROBAN_RPC_URL:
//
//   npx wrangler secret put SOROBAN_RPC_URL
//
// The route is not a general-purpose relay: only the methods the app uses get
// through, one call per request, from this site's own pages. Anyone can still
// script calls against it, so the provider's own rate limits stay the backstop.

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// What @stellar/stellar-sdk's rpc.Server and contract.Client send.
const ALLOWED_METHODS = new Set([
  "getHealth",
  "getNetwork",
  "getLatestLedger",
  "getVersionInfo",
  "getFeeStats",
  "getLedgerEntries",
  "getTransaction",
  "getEvents",
  "simulateTransaction",
  "sendTransaction",
]);

// A signed Soroban transaction is a few KB; this leaves ample headroom.
const MAX_BODY_BYTES = 128 * 1024;

function rpcError(status: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, url }) => {
  const upstream = (env as { SOROBAN_RPC_URL?: string }).SOROBAN_RPC_URL;
  if (!upstream) return rpcError(503, "RPC proxy is not configured");

  // Browsers always send Origin on a POST. Missing means a script, which the
  // provider limits catch; a different one means another site's page.
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return rpcError(403, "Cross-origin RPC is not allowed");

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return rpcError(413, "Request too large");

  let method: unknown;
  try {
    method = (JSON.parse(body) as { method?: unknown }).method;
  } catch {
    return rpcError(400, "Invalid JSON");
  }
  if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
    return rpcError(400, "Method not allowed");
  }

  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
};
