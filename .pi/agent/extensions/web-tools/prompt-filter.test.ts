import test from "node:test";
import assert from "node:assert/strict";

import { tokeniseQuery, scoreQueryParagraph, filterByRelevance, applyPromptFilter } from "./prompt-filter.ts";

// ── tokeniseQuery ─────────────────────────────────────────────────────────────

test("tokeniseQuery lowercases and deduplicates words", () => {
  const result = tokeniseQuery("Authentication AUTH authentication");
  assert.deepEqual(result, ["authentication", "auth"]);
});

test("tokeniseQuery strips common stopwords", () => {
  const result = tokeniseQuery("what is the authentication flow");
  assert.ok(!result.includes("what"), "stopword 'what' should be removed");
  assert.ok(!result.includes("is"), "stopword 'is' should be removed");
  assert.ok(!result.includes("the"), "stopword 'the' should be removed");
  assert.ok(result.includes("authentication"), "'authentication' should remain");
  assert.ok(result.includes("flow"), "'flow' should remain");
});

test("tokeniseQuery returns empty array for empty input", () => {
  assert.deepEqual(tokeniseQuery(""), []);
});

test("tokeniseQuery returns empty array when all words are stopwords", () => {
  const result = tokeniseQuery("the a an is are");
  assert.equal(result.length, 0);
});

// ── scoreQueryParagraph ───────────────────────────────────────────────────────

test("scoreQueryParagraph returns 1.0 when paragraph contains all query words", () => {
  const score = scoreQueryParagraph("The authentication flow uses OAuth tokens.", ["authentication", "oauth", "tokens"]);
  assert.equal(score, 1.0);
});

test("scoreQueryParagraph returns 0.0 when paragraph contains no query words", () => {
  const score = scoreQueryParagraph("This section covers database indexing strategies.", ["authentication", "oauth"]);
  assert.equal(score, 0.0);
});

test("scoreQueryParagraph returns partial score for partial match", () => {
  const score = scoreQueryParagraph("The authentication layer is responsible.", ["authentication", "oauth", "tokens"]);
  assert.ok(score > 0 && score < 1, `expected partial score, got ${score}`);
  assert.ok(Math.abs(score - 1 / 3) < 0.01, `expected ~0.33, got ${score}`);
});

test("scoreQueryParagraph returns 0.0 for empty query tokens", () => {
  const score = scoreQueryParagraph("Any paragraph content.", []);
  assert.equal(score, 0.0);
});

// ── filterByRelevance ─────────────────────────────────────────────────────────

test("filterByRelevance keeps paragraphs matching query and drops irrelevant ones", () => {
  const markdown = [
    "# Section One",
    "",
    "This paragraph talks about authentication and login flows.",
    "",
    "# Section Two",
    "",
    "Database indexing and query optimisation strategies.",
    "",
    "# Section Three",
    "",
    "OAuth tokens are used in the authentication system.",
  ].join("\n");

  const result = filterByRelevance(markdown, ["authentication", "oauth", "tokens"]);
  assert.ok(result.includes("authentication and login"), "relevant paragraph dropped");
  assert.ok(result.includes("OAuth tokens"), "second relevant paragraph dropped");
  assert.ok(!result.includes("Database indexing"), "irrelevant paragraph should be absent");
});

test("filterByRelevance preserves headings before kept paragraphs", () => {
  const markdown = [
    "# Auth Guide",
    "",
    "Authentication tokens are issued on login.",
    "",
    "# Unrelated",
    "",
    "This has nothing to do with auth.",
  ].join("\n");

  const result = filterByRelevance(markdown, ["authentication", "tokens"]);
  assert.ok(result.includes("# Auth Guide"), "heading before kept paragraph should be preserved");
});

test("filterByRelevance returns full content unchanged when no paragraphs score above threshold", () => {
  const markdown = "Database schema migrations and rollback strategies.";
  const result = filterByRelevance(markdown, ["authentication", "oauth"]);
  assert.equal(result, markdown, "should return unchanged when nothing matches");
});

test("filterByRelevance returns full content unchanged for empty query tokens", () => {
  const markdown = "Some content here.";
  const result = filterByRelevance(markdown, []);
  assert.equal(result, markdown, "should return unchanged for empty tokens");
});

// ── applyPromptFilter ─────────────────────────────────────────────────────────

test("applyPromptFilter returns only relevant sections for a focused query", () => {
  const markdown = [
    "# Installation",
    "",
    "Run npm install to set up the project dependencies.",
    "",
    "# Authentication",
    "",
    "Configure OAuth tokens in the authentication settings.",
    "",
    "# Deployment",
    "",
    "Deploy using Docker or Kubernetes for production.",
  ].join("\n");

  const result = applyPromptFilter(markdown, "how does authentication work with OAuth");
  assert.ok(result.includes("OAuth tokens"), "OAuth content missing");
  assert.ok(result.includes("# Authentication"), "section heading missing");
  assert.ok(!result.includes("npm install"), "installation content should be filtered out");
  assert.ok(!result.includes("Docker"), "deployment content should be filtered out");
});

test("applyPromptFilter returns full content when query is empty", () => {
  const markdown = "Some content.";
  const result = applyPromptFilter(markdown, "");
  assert.equal(result, markdown);
});
