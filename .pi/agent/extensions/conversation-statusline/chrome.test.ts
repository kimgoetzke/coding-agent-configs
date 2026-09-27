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

  const line = renderTopLine(theme, 24, "Session 3");

  assert.equal(line.endsWith("<fg:accent>─────</fg>"), true);
});

test("named conversations use stable, varied theme colours for both borders and label", () => {
  const colours = {
    accent: "\u001b[38;2;86;168;245m",
    syntaxNumber: "\u001b[38;2;42;172;184m",
    success: "\u001b[38;2;106;171;115m",
    mdLink: "\u001b[38;2;199;125;187m",
    syntaxVariable: "\u001b[38;2;224;187;101m",
    syntaxKeyword: "\u001b[38;2;207;142;109m",
    userMessageText: "\u001b[38;2;206;208;214m",
  };
  const theme = {
    fg(token, text) { return `<fg:${token}>${text}</fg>`; },
    getFgAnsi(token) { return colours[token]; },
    getBgAnsi(token) { return token === "selectedBg" ? "\u001b[48;2;43;45;48m" : undefined; },
  };
  const expected = [
    ["Session 0", "syntaxNumber"],
    ["Session 1", "success"],
    ["Session 2", "syntaxKeyword"],
    ["Session 3", "accent"],
    ["Session 6", "mdLink"],
    ["Session 7", "syntaxVariable"],
  ];

  for (const [name, token] of expected) {
    const top = renderTopLine(theme, 32, name);
    const bottom = renderLine(theme, 32, { sessionName: name });
    assert.match(top, new RegExp(`<fg:${token}>`));
    assert.equal(bottom, `<fg:${token}>${"─".repeat(32)}</fg>`);
    assert.ok(top.includes(colours[token].replace("[38;", "[48;")));
    assert.equal(renderTopLine(theme, 32, name), top);
  }

  assert.notEqual(renderTopLine(theme, 32, "Session 0"), renderTopLine(theme, 32, "Session 1"));
  assert.equal(renderLine(theme, 3, { sessionName: undefined, fallbackRenderer: (s) => `<border>${s}</border>` }), "<border>───</border>");
});

test("a saved conversation name renders with a theme that rejects background tokens as foregrounds", () => {
  const theme = {
    fg(token, text) { return `<fg:${token}>${text}</fg>`; },
    getFgAnsi(token) {
      if (token === "selectedBg") throw new Error("Unknown theme color: selectedBg");
      return {
        accent: "\u001b[38;2;86;168;245m",
        userMessageText: "\u001b[38;2;206;208;214m",
      }[token];
    },
    getBgAnsi(token) {
      if (token !== "selectedBg") throw new Error(`Unknown theme background color: ${token}`);
      return "\u001b[48;2;43;45;48m";
    },
  };

  assert.ok(renderTopLine(theme, 30, "Session 3").includes("\u001b[48;2;86;168;245m\u001b[38;2;43;45;48m Session 3 \u001b[0m"));
});

test("name text follows theme contrast on warm and dark colours", () => {
  const colours = {
    accent: "\u001b[38;2;86;168;245m",
    syntaxVariable: "\u001b[38;2;224;187;101m",
    userMessageText: "\u001b[38;2;206;208;214m",
  };
  const theme = {
    fg(token, text) { return text; },
    getFgAnsi(token) { return colours[token]; },
    getBgAnsi(token) { return token === "selectedBg" ? "\u001b[48;2;43;45;48m" : undefined; },
  };

  assert.ok(renderTopLine(theme, 30, "Session 7").includes("\u001b[48;2;224;187;101m\u001b[38;2;43;45;48m"));
  colours.accent = "\u001b[38;2;25;64;112m";
  assert.ok(renderTopLine(theme, 30, "Session 3").includes("\u001b[48;2;25;64;112m\u001b[38;2;206;208;214m"));
});

test("renderTopLine uses the chosen line colour as the label background", () => {
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

  const line = renderTopLine(theme, 24, "Session 3");

  assert.equal(line.includes("<fg:accent>"), true);
  assert.equal(line.includes("[48;5;39m[38;5;252m Session 3 [0m"), true);
});
