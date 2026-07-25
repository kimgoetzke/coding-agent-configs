import test from "node:test";
import assert from "node:assert/strict";

import { getResultOutput, isFailedResult, truncateParallelOutput } from "./subagent-result.js";

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
