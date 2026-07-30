import test from "node:test";
import assert from "node:assert/strict";

import { collectSettledResults, mapSettledWithConcurrencyLimit } from "./subagent-orchestration.js";

test("bounded orchestration retains input order and sibling results after rejection", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapSettledWithConcurrencyLimit([30, 5, 10], 2, async (delay, index) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active--;
    if (index === 1) throw new Error("child failed");
    return `child-${index}`;
  });

  assert.equal(peak, 2);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled"]);
  assert.equal(results[0].value, "child-0");
  assert.equal(results[1].reason.message, "child failed");
  assert.equal(results[2].value, "child-2");
});

test("aborting bounded orchestration does not launch queued tasks", async () => {
  const controller = new AbortController();
  const launched = [];
  const results = await mapSettledWithConcurrencyLimit(
    [0, 1, 2],
    1,
    async (_item, index) => {
      launched.push(index);
      controller.abort();
      return `child-${index}`;
    },
    { signal: controller.signal },
  );

  assert.deepEqual(launched, [0]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "rejected"]);
  assert.match(results[1].reason.message, /aborted/i);
});

test("collecting an aborted run preserves fulfilled siblings and every partial slot", () => {
  const placeholders = [
    { agent: "one", status: "running", exitCode: null, messages: [{ role: "assistant", content: "partial one" }] },
    { agent: "two", status: "output_received", exitCode: null, messages: [{ role: "assistant", content: "partial two" }] },
  ];
  const settled = [
    { status: "fulfilled", value: { ...placeholders[0], status: "settled", exitCode: 0 } },
    { status: "rejected", reason: new Error("Subagent was aborted") },
  ];

  const results = collectSettledResults(settled, placeholders, { aborted: true });
  const roundTripped = JSON.parse(JSON.stringify({ diagnosticsPath: "diagnostics.jsonl", results }));

  assert.equal(roundTripped.results.length, 2);
  assert.equal(roundTripped.results[0].status, "settled");
  assert.equal(roundTripped.results[1].status, "aborted");
  assert.equal(roundTripped.results[1].messages[0].content, "partial two");
  assert.match(roundTripped.results[1].errorMessage, /aborted/i);
  assert.equal(roundTripped.diagnosticsPath, "diagnostics.jsonl");
});
