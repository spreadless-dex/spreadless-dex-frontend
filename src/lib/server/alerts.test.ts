// node --test --experimental-strip-types src/lib/server/alerts.test.ts

import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { parseCreate, transitions, type AlertRow } from "./alerts.ts";
import { sep53Hash, verifySigned } from "./auth.ts";

const pool = {
  address: "POOL",
  tokens: [
    { symbol: "USDT0", address: "A", price: 0.9970, reserve: 1 },
    { symbol: "USDC", address: "B", price: 1, reserve: 1 },
  ],
};
const alert = (over: Partial<AlertRow>): AlertRow => ({
  id: "x", owner: "G", pool: "POOL", token_a: "A", token_b: "B", bps: 25,
  channel: "webhook", target: "https://example.com", firing: 0, failures: 0, created_at: 0, ...over,
});

test("fires past the threshold, re-arms only well below it", () => {
  // 30 bps apart.
  assert.equal(transitions([alert({})], [pool]).length, 1);
  assert.equal(transitions([alert({ bps: 40 })], [pool]).length, 0);
  // Already firing at 25: 30 bps keeps it firing, nothing to send.
  assert.equal(transitions([alert({ firing: 1 })], [pool]).length, 0);
  // Firing at 36: 30 bps is under 36 but over 28.8 (80%), so no flap...
  assert.equal(transitions([alert({ firing: 1, bps: 36 })], [pool]).length, 0);
  // ...and at 50 it resolves.
  const [t] = transitions([alert({ firing: 1, bps: 50 })], [pool]);
  assert.equal(t.firing, false);
  // Pending Telegram alerts and unknown pools stay quiet.
  assert.equal(transitions([alert({ target: "start:abc" })], [pool]).length, 0);
  assert.equal(transitions([alert({ pool: "OTHER" })], [pool]).length, 0);
});

test("create input is checked against the pools", () => {
  const ok = { id: crypto.randomUUID(), pool: "POOL", token_a: "A", token_b: "B", bps: 25, channel: "webhook", webhook_url: "https://example.com/hook" };
  assert.equal(typeof parseCreate(ok, [pool]), "object");
  assert.equal(typeof parseCreate({ ...ok, channel: "telegram", webhook_url: undefined }, [pool]), "object");
  for (const bad of [
    { id: "nope" }, { pool: "OTHER" }, { token_b: "A" }, { token_b: "C" }, { bps: 0 }, { bps: 2.5 },
    { channel: "mail" }, { webhook_url: "http://example.com" }, { webhook_url: "not a url" },
  ]) {
    assert.equal(typeof parseCreate({ ...ok, ...bad }, [pool]), "string", JSON.stringify(bad));
  }
});

test("only a fresh SEP-53 signature by the owner passes", async () => {
  const key = Keypair.random();
  const now = Date.now();
  const message = JSON.stringify({ app: "spreadless-alerts", network: "testnet", action: "create", owner: key.publicKey(), ts: now });
  const sig = key.sign(Buffer.from(await sep53Hash(message))).toString("base64");

  assert.equal(typeof (await verifySigned(message, sig, "testnet", now)), "object");
  assert.equal(typeof (await verifySigned(message, Buffer.from(sig, "base64").toString("hex"), "testnet", now)), "object");
  assert.equal(await verifySigned(message, sig, "mainnet", now), "message is not for this app and network");
  assert.equal(await verifySigned(message, sig, "testnet", now + 10 * 60_000), "signature expired, sign again");
  const other = Keypair.random().sign(Buffer.from(await sep53Hash(message))).toString("base64");
  assert.equal(await verifySigned(message, other, "testnet", now), "signature does not match owner");
  // Signing the bare message (no SEP-53 prefix) is not accepted.
  const bare = key.sign(Buffer.from(message)).toString("base64");
  assert.equal(await verifySigned(message, bare, "testnet", now), "signature does not match owner");
});
