// The Worker's entry (wrangler.jsonc "main"): Astro serves every request, and
// the cron checks price alerts once a minute.

import { handle } from "@astrojs/cloudflare/handler";
import {
  describe,
  MAX_FAILURES,
  MIN_POSITION_USD,
  PENDING,
  PENDING_TTL_MS,
  transitions,
  type AlertRow,
} from "./lib/server/alerts";
import { positionUsd, readPools } from "./lib/server/market";
import { rpcUrl } from "./lib/server/marketRoute";
import { deliver, type AlertEnv } from "./lib/server/notify";

async function checkAlerts(env: AlertEnv): Promise<void> {
  const db = env.ALERTS;
  await db
    .prepare("DELETE FROM alerts WHERE target LIKE ? AND created_at < ?")
    .bind(`${PENDING}%`, Date.now() - PENDING_TTL_MS)
    .run();
  const { results } = await db.prepare("SELECT * FROM alerts WHERE target NOT LIKE ?").bind(`${PENDING}%`).all<AlertRow>();
  if (!results.length) return;

  const url = rpcUrl();
  if (!url) throw new Error("SOROBAN_RPC_URL is not configured");
  const pools = await readPools(url);

  // ponytail: one subrequest per change, sequential. Fine while few alerts
  // flip in the same minute; batch or queue them if that stops being true.
  const positions = new Map<string, Promise<number>>();
  for (const t of transitions(results, pools)) {
    const { alert } = t;
    const drop = () => db.prepare("DELETE FROM alerts WHERE id = ?").bind(alert.id).run();

    // The $1 is checked again only when an alert fires: that is when it would
    // cost us something, and it needs no RPC on the quiet minutes.
    if (t.firing) {
      if (!positions.has(alert.owner)) positions.set(alert.owner, positionUsd(alert.owner, pools, url));
      const position = await positions.get(alert.owner)!.catch(() => null);
      if (position === null) continue; // RPC trouble: try again next minute.
      if (position < MIN_POSITION_USD) {
        const text = `Your ${t.name} alert was removed: alerts need at least $${MIN_POSITION_USD} in a Spreadless pool.`;
        await deliver(env, alert.channel, alert.target, text, { alert_id: alert.id, state: "removed" });
        await drop();
        continue;
      }
    }

    const result = await deliver(env, alert.channel, alert.target, describe(t), {
      alert_id: alert.id,
      state: t.firing ? "firing" : "resolved",
      pool: alert.pool,
      spread_bps: Number(t.bps.toFixed(2)),
      threshold_bps: alert.bps,
      high: { symbol: t.high.symbol, address: t.high.address, price: Number(t.high.price.toFixed(7)) },
      low: { symbol: t.low.symbol, address: t.low.address, price: Number(t.low.price.toFixed(7)) },
      at: new Date().toISOString(),
    });
    if (result === "ok") {
      await db.prepare("UPDATE alerts SET firing = ?, failures = 0 WHERE id = ?").bind(t.firing ? 1 : 0, alert.id).run();
    } else if (result === "gone" || alert.failures + 1 >= MAX_FAILURES) {
      await drop();
    } else {
      // State stays as it was, so the next run tries the same message again.
      await db.prepare("UPDATE alerts SET failures = failures + 1 WHERE id = ?").bind(alert.id).run();
    }
  }
}

export default {
  fetch: handle,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(checkAlerts(env as unknown as AlertEnv).catch((err) => console.error("Alert check failed:", err)));
  },
} satisfies ExportedHandler<Env>;
