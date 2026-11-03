// Price alerts: a wallet with at least $1 in a pool asks to hear when any two
// of that pool's tokens drift more than `bps` apart, whichever way. That is the
// spread between its dearest and its cheapest token. The cron in src/worker.ts
// runs transitions() every minute and delivers what changed.
//
// Pure on purpose (no bindings, no config), so alerts.test.ts can run it in
// plain Node.

import type { PoolRead } from "./market";

export type Channel = "webhook" | "telegram";

/** A row of the `alerts` table, see migrations/0001_alerts.sql. */
export interface AlertRow {
  id: string;
  owner: string;
  pool: string;
  bps: number;
  channel: Channel;
  /** Webhook URL, Telegram chat id, or PENDING + code until the user pressed Start. */
  target: string;
  firing: number;
  failures: number;
  created_at: number;
}

export const MAX_ALERTS_PER_OWNER = 10;
export const MIN_POSITION_USD = 1;
export const MAX_FAILURES = 3;
/** A Telegram alert nobody pressed Start on is dropped after this. */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
export const PENDING = "start:";
/**
 * A firing alert re-arms only once the gap is back under this share of its
 * threshold, so a price sitting right on the line can't send a message a minute.
 */
const REARM = 0.8;

type PricedPool = Pick<PoolRead, "address" | "tokens">;

type PricedToken = PricedPool["tokens"][number];

/** The pool's widest pair: its dearest and its cheapest token, and how far apart in bps. */
export function spread(pool: PricedPool): { bps: number; high: PricedToken; low: PricedToken } {
  const byPrice = [...pool.tokens].sort((a, b) => b.price - a.price);
  const high = byPrice[0];
  const low = byPrice[byPrice.length - 1];
  return { bps: (high.price / low.price - 1) * 10_000, high, low };
}

export interface Transition {
  alert: AlertRow;
  firing: boolean;
  bps: number;
  high: PricedToken;
  low: PricedToken;
  /** The pool's tokens, for naming it: "USDT0/PYUSD/USDC". */
  name: string;
}

/** The alerts whose state changes with these prices. Everything else stays quiet. */
export function transitions(alerts: AlertRow[], pools: PricedPool[]): Transition[] {
  const byAddress = new Map(pools.map((p) => [p.address, p]));
  const out: Transition[] = [];
  for (const alert of alerts) {
    if (alert.target.startsWith(PENDING)) continue;
    const pool = byAddress.get(alert.pool);
    if (!pool || pool.tokens.length < 2) continue;
    const { bps, high, low } = spread(pool);
    const firing = alert.firing ? bps >= alert.bps * REARM : bps >= alert.bps;
    if (firing === Boolean(alert.firing)) continue;
    out.push({ alert, firing, bps, high, low, name: pool.tokens.map((t) => t.symbol).join("/") });
  }
  return out;
}

export function describe(t: Transition): string {
  const now = Math.round(t.bps);
  return t.firing
    ? `⚠️ The ${t.name} pool on Spreadless is ${now} bps apart (your alert: ${t.alert.bps}). ` +
        `1 ${t.high.symbol} = ${(t.high.price / t.low.price).toFixed(5)} ${t.low.symbol}.`
    : `✅ The ${t.name} pool on Spreadless is back within ${t.alert.bps} bps (now ${now}).`;
}

export interface NewAlert {
  id: string;
  pool: string;
  bps: number;
  channel: Channel;
  webhook_url?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The create request's fields, checked against the pools that exist. A string is the error. */
export function parseCreate(raw: Record<string, unknown>, pools: PricedPool[]): NewAlert | string {
  const { id, pool, bps, channel, webhook_url } = raw;
  if (typeof id !== "string" || !UUID.test(id)) return "id must be a UUID";
  const found = pools.find((p) => p.address === pool);
  if (!found) return "unknown pool";
  if (!Number.isInteger(bps) || (bps as number) < 1 || (bps as number) > 10_000) return "bps must be a whole number from 1 to 10000";
  if (channel === "telegram") return { id, pool: found.address, bps: bps as number, channel };
  if (channel !== "webhook") return "channel must be webhook or telegram";
  if (typeof webhook_url !== "string" || webhook_url.length > 2048) return "webhook_url is required";
  let url: URL;
  try {
    url = new URL(webhook_url);
  } catch {
    return "webhook_url is not a URL";
  }
  if (url.protocol !== "https:") return "webhook_url must be https";
  return { id, pool: found.address, bps: bps as number, channel, webhook_url: url.href };
}
