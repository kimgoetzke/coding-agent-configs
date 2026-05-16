import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildContextDisplay,
  formatTokens,
  renderSeparatorLine,
  selectContextToken,
  thinkingToken,
  truncatePlain,
} from "./render.ts";

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------

test("formatTokens: values below 1 000", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
});

test("formatTokens: 1 000–9 999 (one decimal k)", () => {
  assert.equal(formatTokens(1000), "1.0k");
  assert.equal(formatTokens(1500), "1.5k");
  assert.equal(formatTokens(9999), "10.0k");
});

test("formatTokens: 10 000–999 999 (rounded k)", () => {
  assert.equal(formatTokens(10000), "10k");
  assert.equal(formatTokens(264000), "264k");
  assert.equal(formatTokens(999999), "1000k");
});

test("formatTokens: 1 000 000–9 999 999 (one decimal M)", () => {
  assert.equal(formatTokens(1000000), "1.0M");
  assert.equal(formatTokens(2500000), "2.5M");
});

test("formatTokens: ≥ 10 000 000 (rounded M)", () => {
  assert.equal(formatTokens(10000000), "10M");
});

// ---------------------------------------------------------------------------
// truncatePlain
// ---------------------------------------------------------------------------

test("truncatePlain: no truncation needed", () => {
  assert.equal(truncatePlain("hello", 10), "hello");
  assert.equal(truncatePlain("hello", 5), "hello");
});

test("truncatePlain: zero or negative width returns empty string", () => {
  assert.equal(truncatePlain("hello", 0), "");
  assert.equal(truncatePlain("hello", -1), "");
});

test("truncatePlain: width 1 returns ellipsis", () => {
  assert.equal(truncatePlain("hello", 1), "…");
});

test("truncatePlain: appends ellipsis when truncating", () => {
  assert.equal(truncatePlain("hello world", 8), "hello w…");
});

// ---------------------------------------------------------------------------
// selectContextToken
// ---------------------------------------------------------------------------

test("selectContextToken: null (unknown) → success", () => {
  assert.equal(selectContextToken(null), "success");
});

test("selectContextToken: below 40 % → muted", () => {
  assert.equal(selectContextToken(0), "muted");
  assert.equal(selectContextToken(39.9), "muted");
});

test("selectContextToken: 40–59.9 % → warning", () => {
  assert.equal(selectContextToken(40), "warning");
  assert.equal(selectContextToken(59.9), "warning");
});

test("selectContextToken: 60 % and above → error", () => {
  assert.equal(selectContextToken(60), "error");
  assert.equal(selectContextToken(100), "error");
});

// ---------------------------------------------------------------------------
// buildContextDisplay
// ---------------------------------------------------------------------------

test("buildContextDisplay: unknown percent", () => {
  assert.equal(buildContextDisplay(null, 200000), "?/200k");
});

test("buildContextDisplay: known percent", () => {
  assert.equal(buildContextDisplay(7.4, 264000), "7.4%/264k");
});

test("buildContextDisplay: rounds percent to one decimal", () => {
  assert.equal(buildContextDisplay(39.95, 100000), "40.0%/100k");
});

// ---------------------------------------------------------------------------
// thinkingToken
// ---------------------------------------------------------------------------

test("thinkingToken: maps all known levels to dedicated theme tokens", () => {
  assert.equal(thinkingToken("off"), "thinkingOff");
  assert.equal(thinkingToken("minimal"), "thinkingMinimal");
  assert.equal(thinkingToken("low"), "thinkingLow");
  assert.equal(thinkingToken("medium"), "thinkingMedium");
  assert.equal(thinkingToken("high"), "thinkingHigh");
  assert.equal(thinkingToken("xhigh"), "thinkingXhigh");
});

test("thinkingToken: unknown level falls back to muted", () => {
  assert.equal(thinkingToken("unknown"), "muted");
  assert.equal(thinkingToken(""), "muted");
  assert.equal(thinkingToken(undefined), "muted");
});

// ---------------------------------------------------------------------------
// renderSeparatorLine
// ---------------------------------------------------------------------------

test("renderSeparatorLine uses the accent token", () => {
  assert.equal(
    renderSeparatorLine(4, {
      fg: (token, text) => `[${token}]${text}`,
    }),
    "[accent]────",
  );
});
