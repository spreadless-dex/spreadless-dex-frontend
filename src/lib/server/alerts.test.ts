// node --test --experimental-strip-types src/lib/server/alerts.test.ts

import assert from "node:assert/strict";
import test from "node:test";
import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { parseCreate, spread, transitions, type AlertRow } from "./alerts.ts";
import { messageDigest, verifySigned } from "./auth.ts";

const pool = {
  address: "POOL",
  tokens: [
    { symbol: "USDT0", address: "A", price: 0.9985, reserve: 1 },
    { symbol: "USDC", address: "B", price: 1, reserve: 1 },
    { symbol: "PYUSD", address: "C", price: 1.0015, reserve: 1 },
  ],
};
const alert = (over: Partial<AlertRow>): AlertRow => ({
  id: "x", owner: "G", pool: "POOL", bps: 25,
  channel: "webhook", target: "https://example.com", firing: 0, failures: 0, created_at: 0, ...over,
});

test("the spread is the widest pair, whichever way round", () => {
  const s = spread(pool);
  assert.equal(s.high.symbol, "PYUSD");
  assert.equal(s.low.symbol, "USDT0");
  assert.ok(Math.abs(s.bps - 30.045) < 0.01);
});

test("fires past the threshold, re-arms only well below it", () => {
  // PYUSD and USDT0 are 30 bps apart; neither is 30 bps from USDC.
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
  const ok = { id: crypto.randomUUID(), pool: "POOL", bps: 25, channel: "webhook", webhook_url: "https://example.com/hook" };
  assert.equal(typeof parseCreate(ok, [pool]), "object");
  assert.equal(typeof parseCreate({ ...ok, channel: "telegram", webhook_url: undefined }, [pool]), "object");
  for (const bad of [
    { id: "nope" }, { pool: "OTHER" }, { bps: 0 }, { bps: 2.5 },
    { channel: "mail" }, { webhook_url: "http://example.com" }, { webhook_url: "not a url" },
  ]) {
    assert.equal(typeof parseCreate({ ...ok, ...bad }, [pool]), "string", JSON.stringify(bad));
  }
});

test("only a fresh, matching transaction signed by the owner passes", async () => {
  const PASS = Networks.TESTNET;
  const key = Keypair.random();
  const now = Date.now();
  const message = JSON.stringify({ app: "spreadless-alerts", network: "testnet", action: "create", owner: key.publicKey(), ts: now });
  const signed = async (opts: { signer?: Keypair; value?: string; seq?: string; passphrase?: string } = {}) => {
    const tx = new TransactionBuilder(new Account(key.publicKey(), opts.seq ?? "-1"), { fee: "100", networkPassphrase: opts.passphrase ?? PASS })
      .addOperation(Operation.manageData({ name: "spreadless-alerts", value: opts.value ?? (await messageDigest(message)) }))
      .setTimeout(300)
      .build();
    tx.sign(opts.signer ?? key);
    return tx.toXDR();
  };

  assert.equal(typeof (await verifySigned(message, await signed(), "testnet", PASS, now)), "object");
  assert.equal(await verifySigned(message, await signed(), "testnet", PASS, now + 10 * 60_000), "signature expired, sign again");
  assert.equal(await verifySigned(message, await signed({ signer: Keypair.random() }), "testnet", PASS, now), "signature does not match owner");
  assert.equal(await verifySigned(message, await signed({ value: "0".repeat(64) }), "testnet", PASS, now), "signed_tx does not carry this message");
  // A real, submittable transaction is not accepted as a signature.
  assert.equal(await verifySigned(message, await signed({ seq: "41" }), "testnet", PASS, now), "signed_tx must be the owner's sequence-0 transaction");
  // Signed for the other network: the hash differs, so the signature fails.
  assert.equal(await verifySigned(message, await signed({ passphrase: Networks.PUBLIC }), "testnet", PASS, now), "signature does not match owner");
  assert.equal(await verifySigned(message, await signed(), "mainnet", PASS, now), "message is not for this app and network");
});
