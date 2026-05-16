import { test } from "node:test";
import { strict as assert } from "node:assert";

import { buildFooterLines } from "./footer.ts";

function buildLines(showSuggestionSeparator: boolean, extensionStatuses: Map<string, string> = new Map()) {
  return buildFooterLines({
    width: 20,
    theme: {
      fg: (token, text) => `[${token}]${text}`,
    },
    cwd: "/home/kgoe/repo",
    branch: "main",
    extensionStatuses,
    showSuggestionSeparator,
    stats: {
      totals: {
        input: 1200,
        output: 345,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
      },
      contextWindow: 200_000,
      contextPercent: null,
      modelId: "claude",
      provider: "anthropic",
      multiProvider: false,
      usingSubscription: false,
      reasoning: false,
    },
  });
}

test("buildFooterLines adds an accent separator while autocomplete suggestions are visible", () => {
  const lines = buildLines(true);

  assert.equal(lines[0], "[accent]────────────────────");
});

test("buildFooterLines omits the separator while autocomplete suggestions are hidden", () => {
  const lines = buildLines(false);

  assert.notEqual(lines[0], "[accent]────────────────────");
  assert.equal(lines.length, 2);
});

test("buildFooterLines sorts and sanitises extension statuses", () => {
  const lines = buildLines(false, new Map([
    ["zeta", "second\nline"],
    ["alpha", " first\tstatus "],
  ]));

  assert.equal(lines[2], "first status second…");
});
