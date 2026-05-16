import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseFetchContentOutput,
  resolveFetchContentMode,
  type ForceVerbatimContentFetchRule,
} from "./fetch-content-mode.ts";

test("resolveFetchContentMode honours explicit summary override over built-in verbatim rules", () => {
  const decision = resolveFetchContentMode("https://github.com/example/repo", "summary");
  assert.equal(decision.requestedMode, "summary");
  assert.equal(decision.effectiveMode, "summary");
  assert.match(decision.reason, /explicit mode=summary/);
});

test("resolveFetchContentMode switches auto mode to verbatim for built-in hosts", () => {
  const decision = resolveFetchContentMode("https://github.com/example/repo", "auto");
  assert.equal(decision.effectiveMode, "verbatim");
  assert.match(decision.reason, /built-in host github\.com/);
});

test("resolveFetchContentMode switches auto mode to verbatim for built-in subdomains", () => {
  const decision = resolveFetchContentMode("https://docs.example.com/reference", "auto");
  assert.equal(decision.effectiveMode, "verbatim");
  assert.match(decision.reason, /built-in subdomain docs/);
});

test("resolveFetchContentMode switches auto mode to verbatim for built-in path prefixes", () => {
  const decision = resolveFetchContentMode("https://example.com/docs/getting-started", "auto");
  assert.equal(decision.effectiveMode, "verbatim");
  assert.match(decision.reason, /built-in pathPrefix \/docs\//);
});

test("resolveFetchContentMode switches auto mode to verbatim for configured rules", () => {
  const rules: ForceVerbatimContentFetchRule[] = [{ host: "internal.example.com", pathPrefix: "/handbook/" }];
  const decision = resolveFetchContentMode(
    "https://internal.example.com/handbook/intro",
    "auto",
    rules,
  );
  assert.equal(decision.effectiveMode, "verbatim");
  assert.match(decision.reason, /config host internal\.example\.com/);
});

test("resolveFetchContentMode falls back to summary when auto mode finds no match", () => {
  const decision = resolveFetchContentMode("https://example.com/blog/post", "auto");
  assert.equal(decision.effectiveMode, "summary");
  assert.match(decision.reason, /auto fallback to summary/);
});

test("chooseFetchContentOutput returns summary text when summary mode has a summary", () => {
  const output = chooseFetchContentOutput(
    { requestedMode: "auto", effectiveMode: "summary", reason: "auto fallback to summary" },
    { content: "Verbatim page text", truncated: true },
    "Summarised page text",
    4000,
  );
  assert.equal(output.agentContent, "Summarised page text");
  assert.equal(output.detailsContent, "Summarised page text");
  assert.equal(output.returnedMode, "summary");
});

test("chooseFetchContentOutput keeps verbatim content when verbatim mode bypasses summarisation", () => {
  const output = chooseFetchContentOutput(
    { requestedMode: "auto", effectiveMode: "verbatim", reason: "auto matched built-in host github.com" },
    { content: "Verbatim page text", truncated: true },
    "Summarised page text",
    4000,
  );
  assert.equal(output.agentContent, "Verbatim page text\n\n[Content truncated to ~4000 tokens]");
  assert.equal(output.detailsContent, "Verbatim page text");
  assert.equal(output.returnedMode, "verbatim");
});

test("chooseFetchContentOutput falls back to verbatim content when summary mode has no summary available", () => {
  const output = chooseFetchContentOutput(
    { requestedMode: "summary", effectiveMode: "summary", reason: "explicit mode=summary" },
    { content: "Verbatim page text", truncated: false },
    null,
    4000,
  );
  assert.equal(output.agentContent, "Verbatim page text");
  assert.equal(output.detailsContent, "Verbatim page text");
  assert.equal(output.returnedMode, "verbatim");
});
