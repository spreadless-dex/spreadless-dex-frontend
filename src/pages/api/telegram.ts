// The Telegram bot's webhook. A bot may only write to someone who wrote to it
// first, so a Telegram alert waits (target "start:<code>") until its owner
// opens t.me/<bot>?start=<code> and presses Start; that message lands here and
// gives us the chat id. Point the bot here once per deployment:
//
//   curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
//     -d url=https://dex.spreadless.xyz/api/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET
//
// The answer rides back in the webhook response (Telegram runs the method in
// it), so replying costs no extra request.

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { PENDING, PENDING_TTL_MS } from "../../lib/server/alerts";
import type { AlertEnv } from "../../lib/server/notify";

export const prerender = false;

const alertEnv = env as unknown as AlertEnv;

const reply = (chatId: string, text: string) =>
  new Response(JSON.stringify({ method: "sendMessage", chat_id: chatId, text }), {
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ request }) => {
  const secret = alertEnv.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as {
    message?: { text?: string; chat?: { id?: number } };
  } | null;
  const text = update?.message?.text?.trim() ?? "";
  const chat = update?.message?.chat?.id;
  // Anything else (edits, joins, stickers) is acknowledged and ignored, or
  // Telegram would keep redelivering it.
  if (chat === undefined) return new Response(null);
  const chatId = String(chat);
  const db = alertEnv.ALERTS;

  const start = /^\/start(?:\s+([0-9a-f]{32}))?$/.exec(text);
  if (start) {
    if (!start[1]) return reply(chatId, "Create an alert at dex.spreadless.xyz first, then open the link it gives you.");
    const res = await db
      .prepare("UPDATE alerts SET target = ? WHERE channel = 'telegram' AND target = ? AND created_at > ?")
      .bind(chatId, PENDING + start[1], Date.now() - PENDING_TTL_MS)
      .run();
    return reply(
      chatId,
      res.meta.changes
        ? "Alert is on. I'll write here when the pair drifts past your threshold, and again when it's back. /stop ends all your alerts here."
        : "That link has expired or was already used. Create the alert again at dex.spreadless.xyz.",
    );
  }

  if (text === "/stop") {
    const res = await db.prepare("DELETE FROM alerts WHERE channel = 'telegram' AND target = ?").bind(chatId).run();
    return reply(chatId, res.meta.changes ? `Stopped ${res.meta.changes} alert(s).` : "No alerts are sending here.");
  }

  return reply(chatId, "I only send Spreadless price alerts. /stop ends them.");
};
