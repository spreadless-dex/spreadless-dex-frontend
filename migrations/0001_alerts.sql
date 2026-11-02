-- Price alerts. See src/lib/server/alerts.ts.
CREATE TABLE alerts (
  -- Chosen by the client and part of the signed message, so a replayed
  -- signature hits the primary key instead of creating a second alert.
  id TEXT PRIMARY KEY,
  -- The wallet that signed for it, G…
  owner TEXT NOT NULL,
  pool TEXT NOT NULL,
  token_a TEXT NOT NULL,
  token_b TEXT NOT NULL,
  bps INTEGER NOT NULL CHECK (bps BETWEEN 1 AND 10000),
  channel TEXT NOT NULL CHECK (channel IN ('webhook', 'telegram')),
  -- Webhook: the URL. Telegram: the chat id, or 'start:<code>' until the user
  -- has pressed Start in the bot.
  target TEXT NOT NULL,
  firing INTEGER NOT NULL DEFAULT 0,
  -- Failed deliveries in a row. The cron drops the alert at 3.
  failures INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX alerts_owner ON alerts (owner);
CREATE INDEX alerts_target ON alerts (target);
