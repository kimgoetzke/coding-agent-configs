import test from "node:test";
import assert from "node:assert/strict";

import { ConcurrencyLimiter } from "./concurrency.ts";

test("ConcurrencyLimiter runs a single operation immediately", async () => {
  const limiter = new ConcurrencyLimiter(2);
  const result = await limiter.run(async () => "ok");
  assert.equal(result, "ok");
});

test("ConcurrencyLimiter runs up to maxConcurrent operations in parallel", async () => {
  const limiter = new ConcurrencyLimiter(2);
  let concurrentCount = 0;
  let peakConcurrentCount = 0;

  const op = () =>
    limiter.run(async () => {
      concurrentCount++;
      peakConcurrentCount = Math.max(peakConcurrentCount, concurrentCount);
      await new Promise<void>(r => setImmediate(r));
      concurrentCount--;
    });

  await Promise.all([op(), op()]);
  assert.equal(peakConcurrentCount, 2);
});

test("ConcurrencyLimiter queues the (N+1)th operation until a slot frees", async () => {
  const limiter = new ConcurrencyLimiter(2);

  let release1!: () => void;
  let release2!: () => void;
  const hold1 = new Promise<void>(r => { release1 = r; });
  const hold2 = new Promise<void>(r => { release2 = r; });

  // Occupy both slots
  const fut1 = limiter.run(() => hold1.then(() => "a"));
  const fut2 = limiter.run(() => hold2.then(() => "b"));

  let thirdStarted = false;
  const fut3 = limiter.run(async () => { thirdStarted = true; return "c"; });

  // Let microtasks settle — third op must still be queued
  await new Promise<void>(r => setImmediate(r));
  assert.equal(thirdStarted, false, "third op must not start while both slots are occupied");

  release1();
  await fut1;

  // After freeing slot 1, third op should proceed
  await new Promise<void>(r => setImmediate(r));
  assert.equal(thirdStarted, true, "third op must start after a slot is freed");

  release2();
  const [r2, r3] = await Promise.all([fut2, fut3]);
  assert.equal(r2, "b");
  assert.equal(r3, "c");
});

test("ConcurrencyLimiter releases slot even when the operation throws", async () => {
  const limiter = new ConcurrencyLimiter(1);

  await assert.rejects(() => limiter.run(async () => { throw new Error("boom"); }));

  // Slot must be free — next call must not hang
  const result = await limiter.run(async () => "recovered");
  assert.equal(result, "recovered");
});
