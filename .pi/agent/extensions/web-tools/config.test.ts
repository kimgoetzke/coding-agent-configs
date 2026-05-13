import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadConfig } from "./config.ts";

function tempConfigFile(content: string): { path: string; cleanup: () => void } {
  const dir = join(tmpdir(), `web-tools-config-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "web-tools.json");
  writeFileSync(path, content, "utf8");
  return { path, cleanup: () => rmSync(dir, { recursive: true }) };
}

test("loadConfig returns empty config with no warning for a missing file", () => {
  const { config, warning } = loadConfig("/tmp/nonexistent-web-tools-config-xyz.json");
  assert.deepEqual(config, {});
  assert.equal(warning, undefined);
});

test("loadConfig returns empty config with warning for invalid JSON", () => {
  const { path, cleanup } = tempConfigFile("not json {{{");
  try {
    const { config, warning } = loadConfig(path);
    assert.deepEqual(config, {});
    assert.ok(typeof warning === "string", "warning should be a string");
    assert.ok(warning.includes("not valid JSON"), `warning should mention JSON: ${warning}`);
  } finally {
    cleanup();
  }
});

test("loadConfig returns empty config with warning when root value is not an object", () => {
  const { path, cleanup } = tempConfigFile("[1, 2, 3]");
  try {
    const { config, warning } = loadConfig(path);
    assert.deepEqual(config, {});
    assert.ok(typeof warning === "string");
  } finally {
    cleanup();
  }
});

test("loadConfig extracts searxngUrl from valid config", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ searxngUrl: "https://searxng.example.com" }));
  try {
    const { config, warning } = loadConfig(path);
    assert.equal(config.searxngUrl, "https://searxng.example.com");
    assert.equal(warning, undefined);
  } finally {
    cleanup();
  }
});

test("loadConfig extracts defaultMaxTokens from valid config", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ defaultMaxTokens: 4000 }));
  try {
    const { config } = loadConfig(path);
    assert.equal(config.defaultMaxTokens, 4000);
  } finally {
    cleanup();
  }
});

test("loadConfig extracts providers list from valid config", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ providers: ["duckduckgo", "wikipedia"] }));
  try {
    const { config } = loadConfig(path);
    assert.deepEqual(config.providers, ["duckduckgo", "wikipedia"]);
  } finally {
    cleanup();
  }
});

test("loadConfig ignores providers list when it contains an unrecognised value", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ providers: ["duckduckgo", "unknown-engine"] }));
  try {
    const { config } = loadConfig(path);
    assert.equal(config.providers, undefined);
  } finally {
    cleanup();
  }
});

test("loadConfig ignores unknown extra keys silently", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ searxngUrl: "https://s.example.com", unknownKey: 42 }));
  try {
    const { config, warning } = loadConfig(path);
    assert.equal(config.searxngUrl, "https://s.example.com");
    assert.equal(warning, undefined);
  } finally {
    cleanup();
  }
});

test("loadConfig extracts cheapModels from valid config", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ cheapModels: ["anthropic/claude-haiku-4-5-20251001", "google/gemini-2.5-flash-lite"] }));
  try {
    const { config } = loadConfig(path);
    assert.deepEqual(config.cheapModels, ["anthropic/claude-haiku-4-5-20251001", "google/gemini-2.5-flash-lite"]);
  } finally {
    cleanup();
  }
});

test("loadConfig accepts empty cheapModels array (opt-out signal)", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ cheapModels: [] }));
  try {
    const { config } = loadConfig(path);
    assert.deepEqual(config.cheapModels, []);
  } finally {
    cleanup();
  }
});

test("loadConfig ignores cheapModels when it contains non-string entries", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ cheapModels: ["anthropic/claude-haiku-4-5-20251001", 42] }));
  try {
    const { config } = loadConfig(path);
    assert.equal(config.cheapModels, undefined);
  } finally {
    cleanup();
  }
});

test("loadConfig leaves cheapModels undefined when not in config", () => {
  const { path, cleanup } = tempConfigFile(JSON.stringify({ searxngUrl: "https://s.example.com" }));
  try {
    const { config } = loadConfig(path);
    assert.equal(config.cheapModels, undefined);
  } finally {
    cleanup();
  }
});
