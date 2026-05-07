import test from "node:test";
import assert from "node:assert/strict";

import { addUrl, addUrls, addUrlsFromText, isAllowed, clear, normaliseUrl } from "./url-allowlist.ts";

// Reset allow-list state before tests that depend on it being empty.
function setup(): void {
  clear();
}

// --- normaliseUrl ---

test("normaliseUrl strips trailing slash from non-root path", () => {
  assert.equal(normaliseUrl("https://example.com/page/"), "https://example.com/page");
});

test("normaliseUrl preserves root path trailing slash", () => {
  assert.equal(normaliseUrl("https://example.com/"), "https://example.com/");
});

test("normaliseUrl strips fragment", () => {
  assert.equal(normaliseUrl("https://example.com/page#section"), "https://example.com/page");
});

test("normaliseUrl strips default http port 80", () => {
  assert.equal(normaliseUrl("http://example.com:80/page"), "http://example.com/page");
});

test("normaliseUrl strips default https port 443", () => {
  assert.equal(normaliseUrl("https://example.com:443/page"), "https://example.com/page");
});

test("normaliseUrl preserves non-default port", () => {
  assert.equal(normaliseUrl("https://example.com:8080/page"), "https://example.com:8080/page");
});

// --- addUrl / isAllowed (tracer bullet) ---

test("isAllowed returns true for an added URL", () => {
  setup();
  addUrl("https://example.com/page");
  assert.equal(isAllowed("https://example.com/page"), true);
});

test("isAllowed returns false for an unknown URL", () => {
  setup();
  assert.equal(isAllowed("https://evil.com/attack"), false);
});

test("isAllowed matches a trailing-slash variant of an added URL", () => {
  setup();
  addUrl("https://example.com/page");
  assert.equal(isAllowed("https://example.com/page/"), true);
});

test("isAllowed matches a fragment variant of an added URL", () => {
  setup();
  addUrl("https://example.com/page");
  assert.equal(isAllowed("https://example.com/page#section"), true);
});

test("isAllowed matches a default-port variant of an added URL", () => {
  setup();
  addUrl("https://example.com/page");
  assert.equal(isAllowed("https://example.com:443/page"), true);
});

// --- addUrls (bulk) ---

test("addUrls adds multiple URLs at once", () => {
  setup();
  addUrls(["https://a.com/x", "https://b.com/y"]);
  assert.equal(isAllowed("https://a.com/x"), true);
  assert.equal(isAllowed("https://b.com/y"), true);
});

// --- addUrlsFromText ---

test("addUrlsFromText extracts URLs from plain text", () => {
  setup();
  addUrlsFromText("Check https://example.com/result and https://other.com/page.");
  assert.equal(isAllowed("https://example.com/result"), true);
  assert.equal(isAllowed("https://other.com/page"), true);
});

test("addUrlsFromText extracts URLs from HTML (href attributes)", () => {
  setup();
  const html = '<a href="https://example.com/found">link</a>';
  addUrlsFromText(html);
  assert.equal(isAllowed("https://example.com/found"), true);
});

test("addUrlsFromText does not add non-matching strings", () => {
  setup();
  addUrlsFromText("no urls here, just text");
  assert.equal(isAllowed("https://example.com"), false);
});

// --- clear ---

test("clear empties the allow-list", () => {
  addUrl("https://example.com/page");
  clear();
  assert.equal(isAllowed("https://example.com/page"), false);
});
