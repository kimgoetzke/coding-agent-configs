import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildContextDisplay,
  formatTokens,
  renderSeparatorLine,
  renderStatsLine,
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

test("selectContextToken: null (unknown) → text", () => {
  assert.equal(selectContextToken(null), "text");
});

test("selectContextToken: below 30 % → success", () => {
  assert.equal(selectContextToken(0), "success");
  assert.equal(selectContextToken(29.9), "success");
});

test("selectContextToken: 30–49.9 % → warning", () => {
  assert.equal(selectContextToken(30), "warning");
  assert.equal(selectContextToken(49.9), "warning");
});

test("selectContextToken: 50 % and above → error", () => {
  assert.equal(selectContextToken(50), "error");
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

// ---------------------------------------------------------------------------
// renderStatsLine
// ---------------------------------------------------------------------------

test("renderStatsLine puts context first on the right before the model", () => {
  const line = renderStatsLine(
    80,
    {
      fg: (token, text) => `[${token}]${text}`,
    },
    {
      totals: {
        input: 1200,
        output: 345,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
      },
      contextWindow: 400000,
      contextPercent: 0,
      modelId: "claude-sonnet-4",
      multiProvider: false,
      usingSubscription: false,
      reasoning: true,
      thinkingLevel: "high",
    },
  );

  assert.ok(line.startsWith("[syntaxNumber]↑1.2k [success]↓345"));
  assert.ok(
    line.endsWith("[success]0.0%/400k[muted] • [warning]claude-sonnet-4[muted] • [thinkingHigh]high"),
  );
  assert.equal(
    line.includes("[warning]claude-sonnet-4[muted] • [thinkingHigh]high[muted]0.0%/400k"),
    false,
  );
});

test("renderStatsLine keeps context ahead of provider-qualified model names", () => {
  const line = renderStatsLine(
    80,
    {
      fg: (token, text) => `[${token}]${text}`,
    },
    {
      totals: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
      },
      contextWindow: 400000,
      contextPercent: 12.3,
      modelId: "claude-sonnet-4",
      provider: "anthropic",
      multiProvider: true,
      usingSubscription: false,
      reasoning: false,
    },
  );

  assert.ok(
    line.endsWith("[success]12.3%/400k[muted] • [muted](anthropic) [warning]claude-sonnet-4"),
  );
});
