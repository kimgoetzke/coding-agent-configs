import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  renderHero,
  countExistingFiles,
  countExtensionsInDir,
  countMarkdownFiles,
  discoverLoadedCounts,
  type LoadedCounts,
} from "./welcome-hero.ts";

const COUNTS: LoadedCounts = { contextFiles: 2, skills: 18, extensions: 3, promptTemplates: 12 };
const EMPTY_COUNTS: LoadedCounts = {
  contextFiles: 0,
  skills: 0,
  extensions: 0,
  promptTemplates: 0,
};

// ─── renderHero — structure ──────────────────────────────────────────────────

test("renderHero returns 9 lines (top border + blank + 5 content + blank + bottom border)", () => {
  assert.equal(renderHero(120, "model", "provider", COUNTS, {}).length, 9);
});

test("renderHero returns empty array when terminal is too narrow", () => {
  assert.deepEqual(renderHero(30, "m", "p", COUNTS, {}), []);
});

test("renderHero top border starts with ╭ and ends with ╮", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines[0].startsWith("╭"), `first line: ${lines[0]}`);
  assert.ok(lines[0].endsWith("╮"), `first line: ${lines[0]}`);
});

test("renderHero bottom border starts with ╰ and ends with ╯", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  const last = lines[lines.length - 1];
  assert.ok(last.startsWith("╰"), `last line: ${last}`);
  assert.ok(last.endsWith("╯"), `last line: ${last}`);
});

test("renderHero top border contains ┬ column junction", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines[0].includes("┬"), `expected ┬ in: ${lines[0]}`);
});

test("renderHero bottom border contains ┴ column junction", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  const last = lines[lines.length - 1];
  assert.ok(last.includes("┴"), `expected ┴ in: ${last}`);
});

test("renderHero inner rows (excluding borders) start and end with │", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  for (const line of lines.slice(1, -1)) {
    assert.ok(line.startsWith("│"), `expected │ at start: ${line}`);
    assert.ok(line.endsWith("│"), `expected │ at end: ${line}`);
  }
});

test("renderHero inner rows contain inner column divider │", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  for (const line of lines.slice(1, -1)) {
    const pipeCount = [...line].filter((c) => c === "│").length;
    assert.ok(pipeCount >= 3, `expected ≥3 │ in: ${line}`);
  }
});

test("renderHero all lines have the same visual width", () => {
  const width = 100;
  const lines = renderHero(width, "model", "provider", COUNTS, {});
  for (const line of lines) {
    assert.equal(line.length, width, `line width mismatch: "${line}"`);
  }
});

test("renderHero second and second-to-last lines are blank spacing rows", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  // Blank spacing rows have no content characters beyond │ borders
  const blankInner = lines[1].slice(1, -1).trim().replaceAll("│", "");
  assert.equal(blankInner, "", `expected blank spacing row, got: ${lines[1]}`);
  const blankInner2 = lines[lines.length - 2].slice(1, -1).trim().replaceAll("│", "");
  assert.equal(blankInner2, "", `expected blank spacing row, got: ${lines[lines.length - 2]}`);
});

// ─── renderHero — logo ───────────────────────────────────────────────────────

test("renderHero first 4 content rows (lines 2–5) contain ██ logo characters", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  // Offset by 2 due to top border + blank spacing row
  for (const line of lines.slice(2, 6)) {
    assert.ok(line.includes("██"), `expected ██ in: ${line}`);
  }
});

test("renderHero logo row 0 (line 2) contains full top bar pattern", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines[2].includes("██████  "), `expected top-bar logo in: ${lines[2]}`);
});

test("renderHero logo row 1 (line 3) contains P-body with hole pattern", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines[3].includes("██  ██  "), `expected P-hole logo in: ${lines[3]}`);
});

test("renderHero logo row 2 (line 4) contains wide-stem and i-block pattern", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines[4].includes("████  ██"), `expected stem+i logo in: ${lines[4]}`);
});

test("renderHero logo row 3 (line 5) contains narrow-stem and i-block pattern", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines[5].includes("██    ██"), `expected stem+i logo in: ${lines[5]}`);
});

// ─── renderHero — content ────────────────────────────────────────────────────

test("renderHero contains welcome greeting", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines.join("\n").includes("Welcome!"));
});

test("renderHero contains model and provider", () => {
  const lines = renderHero(120, "claude-opus-4-7", "anthropic", EMPTY_COUNTS, {});
  const joined = lines.join("\n");
  assert.ok(joined.includes("claude-opus-4-7"));
  assert.ok(joined.includes("anthropic"));
});

test("renderHero contains Loaded heading", () => {
  const lines = renderHero(120, "m", "p", EMPTY_COUNTS, {});
  assert.ok(lines.join("\n").includes("Loaded"));
});

test("renderHero contains all four loaded counts", () => {
  const lines = renderHero(
    120,
    "m",
    "p",
    { contextFiles: 3, skills: 7, extensions: 5, promptTemplates: 11 },
    {},
  );
  const joined = lines.join("\n");
  assert.ok(joined.includes("3 context files"), `missing in:\n${joined}`);
  assert.ok(joined.includes("7 skills"), `missing in:\n${joined}`);
  assert.ok(joined.includes("5 extensions"), `missing in:\n${joined}`);
  assert.ok(joined.includes("11 prompts"), `missing in:\n${joined}`);
});

test("renderHero prefixes each count row with a tick symbol", () => {
  const lines = renderHero(120, "m", "p", COUNTS, {});
  const joined = lines.join("\n");
  // All four count rows should have a leading ✓
  assert.ok(joined.includes("✓ 2 context files"), `missing tick in:\n${joined}`);
  assert.ok(joined.includes("✓ 18 skills"), `missing tick in:\n${joined}`);
  assert.ok(joined.includes("✓ 3 extensions"), `missing tick in:\n${joined}`);
  assert.ok(joined.includes("✓ 12 prompts"), `missing tick in:\n${joined}`);
});

test("renderHero shows tick even when counts are zero", () => {
  const joined = renderHero(120, "m", "p", EMPTY_COUNTS, {}).join("\n");
  assert.ok(joined.includes("✓ 0 context files"));
  assert.ok(joined.includes("✓ 0 skills"));
  assert.ok(joined.includes("✓ 0 extensions"));
  assert.ok(joined.includes("✓ 0 prompts"));
});

// ─── renderHero — theming ────────────────────────────────────────────────────

test("renderHero applies borderAccent token to borders", () => {
  const theme = { fg: (token: string, text: string) => `[${token}]${text}` };
  const joined = renderHero(120, "m", "p", EMPTY_COUNTS, theme).join("\n");
  assert.ok(joined.includes("[borderAccent]"), `expected [borderAccent] in output`);
});

test("renderHero applies mdCode token to Welcome! and Loaded", () => {
  const theme = { fg: (token: string, text: string) => `[${token}]${text}` };
  const joined = renderHero(120, "m", "p", EMPTY_COUNTS, theme).join("\n");
  assert.ok(joined.includes("[mdCode]"), `expected [mdCode] in output`);
});

test("renderHero applies success token to tick symbols", () => {
  const theme = { fg: (token: string, text: string) => `[${token}]${text}` };
  const joined = renderHero(120, "m", "p", COUNTS, theme).join("\n");
  assert.ok(joined.includes("[success]"), `expected [success] tick in output`);
});

test("renderHero applies bold theme to Welcome! and Loaded", () => {
  const theme = { bold: (text: string) => `**${text}**` };
  const joined = renderHero(120, "m", "p", EMPTY_COUNTS, theme).join("\n");
  assert.ok(joined.includes("**Welcome!**"), `expected bold greeting`);
  assert.ok(joined.includes("**Loaded**"), `expected bold Loaded heading`);
});

test("renderHero works without theme (no ANSI codes)", () => {
  const lines = renderHero(80, "model", "provider", COUNTS, {});
  assert.equal(lines.length, 9);
  assert.ok(lines.join("\n").includes("Welcome!"));
});

test("renderHero does not exceed terminal width at narrow (53) terminal", () => {
  // Regression: width=53 with real-world model/provider and counts caused a crash
  // because right-column text (e.g. "✓ 2 context files") overflowed rightTextWidth
  // without being truncated.
  const lines = renderHero(53, "claude-sonnet-4.6", "github-copilot", COUNTS, {});
  for (const line of lines) {
    assert.equal(line.length, 53, `line too wide (${line.length}): "${line}"`);
  }
});

// ─── countExistingFiles ──────────────────────────────────────────────────────

test("countExistingFiles returns 0 for empty list", async () => {
  assert.equal(await countExistingFiles([]), 0);
});

test("countExistingFiles counts only existing paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-ctx-"));
  const existing = join(dir, "AGENTS.md");
  await writeFile(existing, "# Context", "utf8");
  const count = await countExistingFiles([existing, join(dir, "nonexistent.md")]);
  assert.equal(count, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("countExistingFiles counts multiple existing files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-ctx-"));
  const a = join(dir, "a.md");
  const b = join(dir, "b.md");
  await writeFile(a, "", "utf8");
  await writeFile(b, "", "utf8");
  const count = await countExistingFiles([a, b, join(dir, "c.md")]);
  assert.equal(count, 2);
  rmSync(dir, { recursive: true, force: true });
});

// ─── countExtensionsInDir ───────────────────────────────────────────────────

test("countExtensionsInDir returns 0 for nonexistent directory", async () => {
  assert.equal(await countExtensionsInDir("/tmp/definitely-nonexistent-dir-welcome-hero-xyz"), 0);
});

test("countExtensionsInDir counts subdirectories and .ts/.js files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-ext-"));
  await mkdir(join(dir, "my-extension"));
  await writeFile(join(dir, "standalone.ts"), "", "utf8");
  await writeFile(join(dir, "also.js"), "", "utf8");
  await writeFile(join(dir, "readme.md"), "", "utf8"); // should not count
  const count = await countExtensionsInDir(dir);
  assert.equal(count, 3);
  rmSync(dir, { recursive: true, force: true });
});

test("countExtensionsInDir ignores non-extension files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-ext-"));
  await writeFile(join(dir, "settings.json"), "{}", "utf8");
  await writeFile(join(dir, "README.md"), "", "utf8");
  const count = await countExtensionsInDir(dir);
  assert.equal(count, 0);
  rmSync(dir, { recursive: true, force: true });
});

// ─── countMarkdownFiles ──────────────────────────────────────────────────────

test("countMarkdownFiles returns 0 for empty dir list", async () => {
  assert.equal(await countMarkdownFiles([]), 0);
});

test("countMarkdownFiles counts .md files recursively", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-cmds-"));
  await mkdir(join(dir, "subdir"));
  await writeFile(join(dir, "prompt1.md"), "", "utf8");
  await writeFile(join(dir, "subdir", "prompt2.md"), "", "utf8");
  await writeFile(join(dir, "not-md.txt"), "", "utf8");
  const count = await countMarkdownFiles([dir]);
  assert.equal(count, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("countMarkdownFiles sums across multiple directories", async () => {
  const dir1 = await mkdtemp(join(tmpdir(), "wh-cmds-"));
  const dir2 = await mkdtemp(join(tmpdir(), "wh-cmds-"));
  await writeFile(join(dir1, "a.md"), "", "utf8");
  await writeFile(join(dir2, "b.md"), "", "utf8");
  await writeFile(join(dir2, "c.md"), "", "utf8");
  const count = await countMarkdownFiles([dir1, dir2]);
  assert.equal(count, 3);
  rmSync(dir1, { recursive: true, force: true });
  rmSync(dir2, { recursive: true, force: true });
});

test("countMarkdownFiles silently skips nonexistent directories", async () => {
  const count = await countMarkdownFiles(["/tmp/nonexistent-wh-xyz", "/tmp/also-nonexistent-wh-xyz"]);
  assert.equal(count, 0);
});

// ─── discoverLoadedCounts ────────────────────────────────────────────────────

test("discoverLoadedCounts passes through skill count", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-project-"));
  const counts = await discoverLoadedCounts(dir, 7);
  assert.equal(counts.skills, 7);
  rmSync(dir, { recursive: true, force: true });
});

test("discoverLoadedCounts returns numeric counts for all fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-project-"));
  const counts = await discoverLoadedCounts(dir, 0);
  assert.ok(typeof counts.contextFiles === "number");
  assert.ok(typeof counts.extensions === "number");
  assert.ok(typeof counts.promptTemplates === "number");
  rmSync(dir, { recursive: true, force: true });
});

test("discoverLoadedCounts detects project-local AGENTS.md", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wh-project-"));
  await writeFile(join(dir, "AGENTS.md"), "# Context", "utf8");
  const counts = await discoverLoadedCounts(dir, 0);
  assert.ok(counts.contextFiles >= 1, `expected contextFiles >= 1, got ${counts.contextFiles}`);
  rmSync(dir, { recursive: true, force: true });
});
