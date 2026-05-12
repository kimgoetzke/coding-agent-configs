import test from "node:test";
import assert from "node:assert/strict";

import { truncateBody, formatByteCount } from "./rendering.ts";

test("truncateBody returns body unchanged when under limit", () => {
  const body = "hello world";
  assert.equal(truncateBody(body, 100), body);
});

test("truncateBody returns body unchanged when exactly at limit", () => {
  const body = "a".repeat(100);
  assert.equal(truncateBody(body, 100), body);
});

test("truncateBody truncates and appends tail marker when over limit", () => {
  const body = "a".repeat(150);
  const result = truncateBody(body, 100);
  assert.equal(result.slice(0, 100), "a".repeat(100));
  assert.match(result, /50 more chars/);
});

test("formatByteCount formats raw bytes under 1024", () => {
  assert.equal(formatByteCount(0), "0 B");
  assert.equal(formatByteCount(512), "512 B");
  assert.equal(formatByteCount(1023), "1023 B");
});

test("formatByteCount formats kilobytes", () => {
  assert.equal(formatByteCount(1024), "1.0 KB");
  assert.equal(formatByteCount(2048), "2.0 KB");
  assert.equal(formatByteCount(7715), "7.5 KB");
});

test("formatByteCount formats megabytes", () => {
  assert.equal(formatByteCount(1024 * 1024), "1.0 MB");
  assert.equal(formatByteCount(2 * 1024 * 1024), "2.0 MB");
});
