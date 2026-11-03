// Delivering an alert: one fetch to the user's webhook or to Telegram.

import type { Channel } from "./alerts";

/** What the alert code reads off the Worker env. Secrets are set with `wrangler secret put`. */
export interface AlertEnv {
  ALERTS: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_USERNAME?: string;
}

/** ok, failed (try again next run), or gone (the receiver wants no more). */
export type Delivery = "ok" | "failed" | "gone";

export async function deliver(
  env: AlertEnv,
  channel: Channel,
  target: string,
  text: string,
  payload: Record<string, unknown>,
): Promise<Delivery> {
  try {
    if (channel === "webhook") {
      const res = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "spreadless-alerts" },
        body: JSON.stringify({ ...payload, text }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? "ok" : res.status === 410 ? "gone" : "failed";
    }
    if (!env.TELEGRAM_BOT_TOKEN) return "failed";
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: target, text }),
      signal: AbortSignal.timeout(5000),
    });
    // 403: the user blocked the bot or deleted the chat.
    return res.ok ? "ok" : res.status === 403 ? "gone" : "failed";
  } catch {
    return "failed";
  }
}
