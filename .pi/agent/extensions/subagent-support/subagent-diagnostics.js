import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const MAX_FIELD_CHARS = 4096;
const DEFAULT_MAX_RECORDS = 2000;
const DEFAULT_MAX_RECORD_BYTES = 16 * 1024;

function sanitise(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message.slice(0, MAX_FIELD_CHARS),
      ...(value.code === undefined ? {} : { code: String(value.code) }),
    };
  }
  if (typeof value === "string") {
    return value.length <= MAX_FIELD_CHARS ? value : `${value.slice(0, MAX_FIELD_CHARS)}…[truncated]`;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitise(entry, seen));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitise(entry, seen)]));
}

export function createSubagentDiagnostics({
  toolCallId,
  wallNow = () => new Date(),
  monotonicNow = () => performance.now(),
  maxRecords = DEFAULT_MAX_RECORDS,
  maxRecordBytes = DEFAULT_MAX_RECORD_BYTES,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-diagnostics-"));
  const diagnosticsPath = path.join(dir, "lifecycle.jsonl");
  fs.writeFileSync(diagnosticsPath, "", { encoding: "utf8", mode: 0o600 });

  let recordCount = 0;

  return {
    path: diagnosticsPath,
    record(event, metadata = {}) {
      if (recordCount >= maxRecords) return false;
      const base = {
        wallTime: wallNow().toISOString(),
        monotonicMs: monotonicNow(),
        toolCallId,
        event,
      };
      let line = `${JSON.stringify({ ...sanitise(metadata), ...base })}\n`;
      if (Buffer.byteLength(line, "utf8") > maxRecordBytes) {
        line = `${JSON.stringify({ ...base, recordTruncated: true })}\n`;
      }
      if (Buffer.byteLength(line, "utf8") > maxRecordBytes) return false;
      try {
        fs.appendFileSync(diagnosticsPath, line, "utf8");
        recordCount++;
        return true;
      } catch {
        return false;
      }
    },
  };
}
