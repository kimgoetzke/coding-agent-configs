import test from "node:test";
import assert from "node:assert/strict";

import {
  countResultStatuses,
  getResultOutput,
  isFailedResult,
  isTerminalResult,
  truncateParallelOutput,
} from "./subagent-result.js";

test("queued, running, and output-received children remain non-terminal", () => {
  const results = [
    { status: "queued", exitCode: null },
    { status: "running", exitCode: null },
    { status: "output_received", exitCode: null },
  ];

  assert.deepEqual(results.map(isTerminalResult), [false, false, false]);
  assert.deepEqual(countResultStatuses(results), {
    queued: 1,
    running: 1,
    outputReceived: 1,
    succeeded: 0,
    failed: 0,
    aborted: 0,
    done: 0,
    active: 3,
  });
});

test("settled, failed, and aborted statuses are terminal and authoritative", () => {
  const results = [
    { status: "settled", exitCode: 9, stopReason: "error" },
    { status: "failed", exitCode: null },
    { status: "aborted", exitCode: 0 },
  ];

  assert.deepEqual(results.map(isTerminalResult), [true, true, true]);
  assert.deepEqual(results.map(isFailedResult), [false, true, true]);
  assert.deepEqual(countResultStatuses(results), {
    queued: 0,
    running: 0,
    outputReceived: 0,
    succeeded: 1,
    failed: 1,
    aborted: 1,
    done: 3,
    active: 0,
  });
});

test("legacy persisted results fall back to exit-code lifecycle semantics", () => {
  const results = [
    { exitCode: -1 },
    { exitCode: 0, stopReason: "end" },
    { exitCode: 1 },
  ];

  assert.deepEqual(results.map(isTerminalResult), [false, true, true]);
  assert.deepEqual(countResultStatuses(results), {
    queued: 0,
    running: 1,
    outputReceived: 0,
    succeeded: 1,
    failed: 1,
    aborted: 0,
    done: 2,
    active: 1,
  });
});

test("failed subagents expose stderr even when no assistant output was produced", () => {
  const result = {
    exitCode: 1,
    stderr: "child process failed",
    stopReason: undefined,
    errorMessage: undefined,
  };

  assert.equal(isFailedResult(result), true);
  assert.equal(getResultOutput(result, ""), "child process failed");
});

test("error and aborted stop reasons fail even when the subprocess exits successfully", () => {
  assert.equal(isFailedResult({ exitCode: 0, stopReason: "error" }), true);
  assert.equal(isFailedResult({ exitCode: 0, stopReason: "aborted" }), true);
  assert.equal(isFailedResult({ exitCode: 0, stopReason: "end" }), false);
});

test("parallel output is preserved up to 50 KiB and reports truncation beyond it", () => {
  const withinLimit = "a".repeat(50 * 1024);
  assert.equal(truncateParallelOutput(withinLimit), withinLimit);

  const overLimit = `${withinLimit}extra`;
  const truncated = truncateParallelOutput(overLimit);
  assert.match(truncated, /^a+\n\n\[Output truncated: 5 bytes omitted\./);
  assert.equal(Buffer.byteLength(truncated.split("\n\n")[0], "utf8"), 50 * 1024);
});
