import test from "node:test";
import assert from "node:assert/strict";

import { buildTopBand, fitSessionLabel } from "./layout.ts";

test("fitSessionLabel pads a session name with spaces for display in the chrome", () => {
  assert.equal(fitSessionLabel("Roadmap", 20), " Roadmap ");
});

test("fitSessionLabel truncates long names to the available width", () => {
  assert.equal(fitSessionLabel("A very long session name", 8), " A ver… ");
});

test("buildTopBand right-aligns the session label within the available width", () => {
  const band = buildTopBand(20, "Roadmap");

  assert.equal(band.length, 20);
  assert.equal(band, "            Roadmap ");
});

test("buildTopBand falls back to an empty band when no session name is set", () => {
  assert.equal(buildTopBand(12, ""), "            ");
});

test("buildTopBand keeps the output width stable in narrow terminals", () => {
  const band = buildTopBand(5, "Roadmap");

  assert.equal(band.length, 5);
  assert.equal(band, " Ro… ");
});

test("buildTopBand preserves a generous left gutter when long names would otherwise fill the whole line", () => {
  const band = buildTopBand(20, "A very long session name");
  const leadingSpaces = band.length - band.trimStart().length;

  assert.equal(band.length, 20);
  assert.equal(leadingSpaces >= 8, true);
  assert.equal(band.endsWith(" "), true);
});
