// node --test --experimental-strip-types src/lib/server/throttle.test.ts

import assert from "node:assert/strict";
import test from "node:test";
import { isRateLimited, mapLimited, rpcCall } from "./throttle.ts";

const tooMany = Object.assign(new Error("Request failed with status code 429"), { response: { status: 429 } });

test("isRateLimited knows axios' 429 and nothing else", () => {
  assert.equal(isRateLimited(tooMany), true);
  assert.equal(isRateLimited({ status: 429 }), true);
  assert.equal(isRateLimited(Object.assign(new Error("x"), { response: { status: 500 } })), false);
  assert.equal(isRateLimited(new Error("simulation failed")), false);
  assert.equal(isRateLimited(null), false);
});

test("rpcCall retries a 429 and gives up after the last delay", async () => {
  let calls = 0;
  assert.equal(await rpcCall(async () => (++calls < 3 ? Promise.reject(tooMany) : "ok"), [0, 0, 0]), "ok");
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(rpcCall(async () => (calls++, Promise.reject(tooMany)), [0, 0]), tooMany);
  assert.equal(calls, 3);
});

test("rpcCall does not retry other failures", async () => {
  let calls = 0;
  const boom = new Error("simulation failed");
  await assert.rejects(rpcCall(async () => (calls++, Promise.reject(boom)), [0, 0]), boom);
  assert.equal(calls, 1);
});

test("mapLimited keeps order and never exceeds the limit", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimited([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
    peak = Math.max(peak, ++running);
    await new Promise((r) => setTimeout(r, n));
    running--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 40, 20, 30, 0, 60]);
  assert.equal(peak, 3);
  assert.deepEqual(await mapLimited([], 3, async (n: number) => n), []);
});
