import test from "node:test";
import assert from "node:assert/strict";

import { renderLine, renderTopLine } from "./chrome.ts";

test("renderLine falls back to a thin dash line when no theme helper is available", () => {
  assert.equal(renderLine({}, 5), "─────");
});

test("renderTopLine leaves five trailing dashes after the conversation label", () => {
  const theme = {
    fg(token, text) {
      return `<fg:${token}>${text}</fg>`;
    },
    getFgAnsi(token) {
      if (token === "accent") return "[38;5;39m";
      if (token === "userMessageText") return "[38;5;252m";
      return "[39m";
    },
  };

  const line = renderTopLine(theme, 24, "Roadmap");

  assert.equal(line.endsWith("<fg:accent>─────</fg>"), true);
});

test("renderTopLine uses accent line colour and an accent-derived background for the label", () => {
  const theme = {
    fg(token, text) {
      return `<fg:${token}>${text}</fg>`;
    },
    getFgAnsi(token) {
      if (token === "accent") return "[38;5;39m";
      if (token === "userMessageText") return "[38;5;252m";
      return "[39m";
    },
  };

  const line = renderTopLine(theme, 24, "Roadmap");

  assert.equal(line.includes("<fg:accent>"), true);
  assert.equal(line.includes("[48;5;39m[38;5;252m Roadmap [0m"), true);
});
