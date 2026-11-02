// Price alerts. Documented in src/content/docs/developers/alerts-api.mdx.
//
//   GET    /api/alerts?owner=G…        the wallet's alerts, without their targets
//   POST   /api/alerts  { message, signature }   action "create"
//   DELETE /api/alerts  { message, signature }   action "delete"
//
// The message is the request: JSON the wallet signed (see auth.ts).

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { StrKey } from "@stellar/stellar-sdk";
import { NETWORK } from "../../lib/stellar/config";
import { MAX_ALERTS_PER_OWNER, MIN_POSITION_USD, parseCreate, PENDING } from "../../lib/server/alerts";
import { verifySigned, type SignedRequest } from "../../lib/server/auth";
import { positionUsd, readPools } from "../../lib/server/market";
import { rpcUrl } from "../../lib/server/marketRoute";
import type { AlertEnv } from "../../lib/server/notify";

export const prerender = false;

const alertEnv = env as unknown as AlertEnv;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function signed(request: Request, action: string): Promise<SignedRequest | Response> {
  let body: { message?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "body must be JSON" });
  }
  if (typeof body.message !== "string" || typeof body.signature !== "string" || body.message.length > 4096) {
    return json(400, { error: "message and signature are required" });
  }
  const req = await verifySigned(body.message, body.signature, NETWORK);
  if (typeof req === "string") return json(401, { error: req });
  if (req.action !== action) return json(400, { error: `message action must be "${action}"` });
  return req;
}

export const GET: APIRoute = async ({ url }) => {
  const owner = url.searchParams.get("owner") ?? "";
  if (!StrKey.isValidEd25519PublicKey(owner)) return json(400, { error: "owner must be a G… address" });
  const { results } = await alertEnv.ALERTS.prepare(
    `SELECT id, pool, token_a, token_b, bps, channel, firing, target LIKE ? AS pending, created_at
     FROM alerts WHERE owner = ? ORDER BY created_at`,
  )
    .bind(`${PENDING}%`, owner)
    .all();
  return json(200, { alerts: results.map((r) => ({ ...r, firing: Boolean(r.firing), pending: Boolean(r.pending) })) });
};

export const POST: APIRoute = async ({ request }) => {
  const req = await signed(request, "create");
  if (req instanceof Response) return req;

  const url = rpcUrl();
  if (!url) return json(503, { error: "Market data is unavailable right now." });
  let pools;
  try {
    pools = await readPools(url);
  } catch (err) {
    console.error("Alert create: pool read failed:", err);
    return json(503, { error: "Market data is unavailable right now." });
  }
  const alert = parseCreate(req, pools);
  if (typeof alert === "string") return json(400, { error: alert });

  const db = alertEnv.ALERTS;
  const count = await db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE owner = ?").bind(req.owner).first<number>("n");
  if ((count ?? 0) >= MAX_ALERTS_PER_OWNER) return json(429, { error: `at most ${MAX_ALERTS_PER_OWNER} alerts per wallet` });

  const position = await positionUsd(req.owner, pools, url).catch(() => null);
  if (position === null) return json(503, { error: "Market data is unavailable right now." });
  if (position < MIN_POSITION_USD) {
    return json(403, { error: `alerts need at least $${MIN_POSITION_USD} of liquidity in a Spreadless pool` });
  }

  let target = alert.webhook_url ?? "";
  let telegramLink: string | undefined;
  if (alert.channel === "telegram") {
    const bot = alertEnv.TELEGRAM_BOT_USERNAME;
    if (!bot || !alertEnv.TELEGRAM_BOT_TOKEN) return json(501, { error: "Telegram alerts are not set up yet" });
    const code = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    target = PENDING + code;
    telegramLink = `https://t.me/${bot}?start=${code}`;
  }

  try {
    await db
      .prepare(
        `INSERT INTO alerts (id, owner, pool, token_a, token_b, bps, channel, target, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(alert.id, req.owner, alert.pool, alert.token_a, alert.token_b, alert.bps, alert.channel, target, Date.now())
      .run();
  } catch {
    // The id is in the signed message, so this is a replay or a double submit.
    return json(409, { error: "this alert already exists" });
  }
  return json(201, { id: alert.id, telegram_link: telegramLink });
};

export const DELETE: APIRoute = async ({ request }) => {
  const req = await signed(request, "delete");
  if (req instanceof Response) return req;
  if (typeof req.id !== "string") return json(400, { error: "id is required" });
  const res = await alertEnv.ALERTS.prepare("DELETE FROM alerts WHERE id = ? AND owner = ?").bind(req.id, req.owner).run();
  return res.meta.changes ? json(200, { deleted: req.id }) : json(404, { error: "no such alert for this wallet" });
};
