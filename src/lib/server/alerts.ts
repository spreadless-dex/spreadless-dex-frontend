// Price alerts: a wallet with at least $1 in a pool asks to hear when two of
// that pool's tokens drift more than `bps` apart. The cron in src/worker.ts
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
  token_a: string;
  token_b: string;
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

/** How far apart a and b trade in this pool, in bps. Null if either isn't in it. */
export function deviationBps(pool: PricedPool, a: string, b: string): number | null {
  const ta = pool.tokens.find((t) => t.address === a);
  const tb = pool.tokens.find((t) => t.address === b);
  if (!ta || !tb) return null;
  return Math.abs(ta.price / tb.price - 1) * 10_000;
}

export interface Transition {
  alert: AlertRow;
  firing: boolean;
  bps: number;
  /** One token_a in token_b. */
  price: number;
  symbols: [string, string];
}

/** The alerts whose state changes with these prices. Everything else stays quiet. */
export function transitions(alerts: AlertRow[], pools: PricedPool[]): Transition[] {
  const byAddress = new Map(pools.map((p) => [p.address, p]));
  const out: Transition[] = [];
  for (const alert of alerts) {
    if (alert.target.startsWith(PENDING)) continue;
    const pool = byAddress.get(alert.pool);
    if (!pool) continue;
    const bps = deviationBps(pool, alert.token_a, alert.token_b);
    if (bps === null) continue;
    const firing = alert.firing ? bps >= alert.bps * REARM : bps >= alert.bps;
    if (firing === Boolean(alert.firing)) continue;
    const a = pool.tokens.find((t) => t.address === alert.token_a)!;
    const b = pool.tokens.find((t) => t.address === alert.token_b)!;
    out.push({ alert, firing, bps, price: a.price / b.price, symbols: [a.symbol, b.symbol] });
  }
  return out;
}

export function describe(t: Transition): string {
  const [a, b] = t.symbols;
  const now = Math.round(t.bps);
  return t.firing
    ? `⚠️ ${a}/${b} is ${now} bps apart on Spreadless (your alert: ${t.alert.bps}). 1 ${a} = ${t.price.toFixed(5)} ${b}.`
    : `✅ ${a}/${b} is back within ${t.alert.bps} bps on Spreadless (now ${now}).`;
}

export interface NewAlert {
  id: string;
  pool: string;
  token_a: string;
  token_b: string;
  bps: number;
  channel: Channel;
  webhook_url?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The create request's fields, checked against the pools that exist. A string is the error. */
export function parseCreate(raw: Record<string, unknown>, pools: PricedPool[]): NewAlert | string {
  const { id, pool, token_a, token_b, bps, channel, webhook_url } = raw;
  if (typeof id !== "string" || !UUID.test(id)) return "id must be a UUID";
  const found = pools.find((p) => p.address === pool);
  if (!found) return "unknown pool";
  const tokens = found.tokens.map((t) => t.address);
  if (typeof token_a !== "string" || typeof token_b !== "string" || !tokens.includes(token_a) || !tokens.includes(token_b)) {
    return "tokens must both be in the pool";
  }
  if (token_a === token_b) return "pick two different tokens";
  if (!Number.isInteger(bps) || (bps as number) < 1 || (bps as number) > 10_000) return "bps must be a whole number from 1 to 10000";
  if (channel === "telegram") return { id, pool: found.address, token_a, token_b, bps: bps as number, channel };
  if (channel !== "webhook") return "channel must be webhook or telegram";
  if (typeof webhook_url !== "string" || webhook_url.length > 2048) return "webhook_url is required";
  let url: URL;
  try {
    url = new URL(webhook_url);
  } catch {
    return "webhook_url is not a URL";
  }
  if (url.protocol !== "https:") return "webhook_url must be https";
  return { id, pool: found.address, token_a, token_b, bps: bps as number, channel, webhook_url: url.href };
}
