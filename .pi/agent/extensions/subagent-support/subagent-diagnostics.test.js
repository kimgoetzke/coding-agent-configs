import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createSubagentDiagnostics } from "./subagent-diagnostics.js";

function removeDiagnostics(logger) {
  fs.rmSync(path.dirname(logger.path), { recursive: true, force: true });
}

test("diagnostic loggers use unique files and append ordered correlated records", () => {
  let monotonicMs = 10;
  const options = {
    toolCallId: "call-1",
    wallNow: () => new Date("2026-07-25T15:00:00.000Z"),
    monotonicNow: () => monotonicMs++,
  };
  const first = createSubagentDiagnostics(options);
  const second = createSubagentDiagnostics(options);

  try {
    first.record("spawn_request", { childIndex: 0, agent: "reviewer" });
    first.record("spawn_result", { childIndex: 0, agent: "reviewer", pid: 42 });

    assert.notEqual(first.path, second.path);
    const records = fs.readFileSync(first.path, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(records.map((record) => record.event), ["spawn_request", "spawn_result"]);
    assert.deepEqual(records[0], {
      wallTime: "2026-07-25T15:00:00.000Z",
      monotonicMs: 10,
      toolCallId: "call-1",
      event: "spawn_request",
      childIndex: 0,
      agent: "reviewer",
    });
    assert.equal(records[1].pid, 42);
    assert.equal(records[1].monotonicMs, 11);
  } finally {
    removeDiagnostics(first);
    removeDiagnostics(second);
  }
});

test("diagnostic metadata safely serialises errors and circular values", () => {
  const logger = createSubagentDiagnostics({ toolCallId: "call-safe" });
  const circular = {};
  circular.self = circular;
  const error = Object.assign(new Error("taskkill failed"), { code: "ENOENT" });

  try {
    assert.equal(logger.record("cleanup", { error, circular }), true);
    const record = JSON.parse(fs.readFileSync(logger.path, "utf8").trim());
    assert.deepEqual(record.error, { name: "Error", message: "taskkill failed", code: "ENOENT" });
    assert.deepEqual(record.circular, { self: "[Circular]" });
  } finally {
    removeDiagnostics(logger);
  }
});

test("diagnostic logs bound record count and record size", () => {
  const logger = createSubagentDiagnostics({
    toolCallId: "call-bounded",
    maxRecords: 2,
    maxRecordBytes: 400,
  });

  try {
    assert.equal(logger.record("large", { detail: "x".repeat(10_000) }), true);
    assert.equal(logger.record("second"), true);
    assert.equal(logger.record("discarded"), false);

    const lines = fs.readFileSync(logger.path, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines.every((line) => Buffer.byteLength(`${line}\n`, "utf8") <= 400));
    assert.equal(JSON.parse(lines[0]).recordTruncated, true);
  } finally {
    removeDiagnostics(logger);
  }
});
