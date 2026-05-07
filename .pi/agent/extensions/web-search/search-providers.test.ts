import test from "node:test";
import assert from "node:assert/strict";

import {
  parseDuckDuckGoHtml,
  parseSearXNGJson,
  parseWikipediaOpenSearch,
  parseBingHtml,
  decodeBingUrl,
  RateLimiter,
  searchWithProviders,
} from "./search-providers.ts";
import type { SearchResult } from "./search-providers.ts";

// ── DDG HTML fixture ─────────────────────────────────────────────────────────

const DDG_HTML_FIXTURE = `
<html><body>
<div class="results">
  <div class="result results_links results_links_deep web-result">
    <div class="result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1&rut=abc">Example Page One</a>
      </h2>
      <div class="result__extras">
        <a class="result__url" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1">example.com</a>
      </div>
      <a class="result__snippet" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1">Snippet for result one about testing.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="/l/?uddg=https%3A%2F%2Fother.org%2Farticle&rut=xyz">Other Article Title</a>
      </h2>
      <div class="result__extras">
        <a class="result__url" href="/l/?uddg=https%3A%2F%2Fother.org%2Farticle">other.org</a>
      </div>
      <a class="result__snippet" href="/l/?uddg=https%3A%2F%2Fother.org%2Farticle">Snippet for result two <b>with bold</b> text.</a>
    </div>
  </div>
</div>
</body></html>
`;

// ── parseDuckDuckGoHtml ───────────────────────────────────────────────────────

test("parseDuckDuckGoHtml returns two results from fixture", () => {
  const results = parseDuckDuckGoHtml(DDG_HTML_FIXTURE);
  assert.equal(results.length, 2);
});

test("parseDuckDuckGoHtml extracts correct title and URL from first result", () => {
  const results = parseDuckDuckGoHtml(DDG_HTML_FIXTURE);
  assert.equal(results[0]?.title, "Example Page One");
  assert.equal(results[0]?.url, "https://example.com/page1");
});

test("parseDuckDuckGoHtml extracts snippet and strips inner HTML tags", () => {
  const results = parseDuckDuckGoHtml(DDG_HTML_FIXTURE);
  assert.equal(results[1]?.snippet, "Snippet for result two with bold text.");
});

test("parseDuckDuckGoHtml decodes percent-encoded DDG redirect URLs", () => {
  const html = `<a class="result__a" href="/l/?uddg=https%3A%2F%2Fencoded.example.com%2Fpath%3Fq%3D1">T</a>
                <a class="result__snippet">S</a>`;
  const results = parseDuckDuckGoHtml(html);
  assert.equal(results[0]?.url, "https://encoded.example.com/path?q=1");
});

test("parseDuckDuckGoHtml returns empty array for HTML with no result__a links", () => {
  assert.deepEqual(parseDuckDuckGoHtml("<html><body>nothing here</body></html>"), []);
});

// ── parseSearXNGJson ─────────────────────────────────────────────────────────

const SEARXNG_FIXTURE = {
  results: [
    { title: "SearXNG Result One", url: "https://searxng-one.example.com", content: "SearXNG snippet one.", publishedDate: "2024-01-15T00:00:00Z" },
    { title: "SearXNG Result Two", url: "https://searxng-two.example.com", content: "SearXNG snippet two." },
  ],
};

test("parseSearXNGJson extracts title, url, snippet from fixture", () => {
  const results = parseSearXNGJson(SEARXNG_FIXTURE);
  assert.equal(results.length, 2);
  assert.equal(results[0]?.title, "SearXNG Result One");
  assert.equal(results[0]?.url, "https://searxng-one.example.com");
  assert.equal(results[0]?.snippet, "SearXNG snippet one.");
});

test("parseSearXNGJson includes date when present, omits when absent", () => {
  const results = parseSearXNGJson(SEARXNG_FIXTURE);
  assert.equal(results[0]?.date, "2024-01-15T00:00:00Z");
  assert.equal(results[1]?.date, undefined);
});

test("parseSearXNGJson skips items missing title or URL", () => {
  const data = { results: [{ url: "https://a.com" }, { title: "T", url: "https://b.com", content: "S" }] };
  const results = parseSearXNGJson(data);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.url, "https://b.com");
});

test("parseSearXNGJson returns empty array for non-object input", () => {
  assert.deepEqual(parseSearXNGJson(null), []);
  assert.deepEqual(parseSearXNGJson("string"), []);
  assert.deepEqual(parseSearXNGJson({ noResults: [] }), []);
});

// ── parseWikipediaOpenSearch ──────────────────────────────────────────────────

// Wikipedia OpenSearch format: [query, [titles], [descriptions], [urls]]
const WIKIPEDIA_FIXTURE = [
  "test query",
  ["Wiki Article One", "Wiki Article Two"],
  ["Description of article one.", "Description of article two."],
  ["https://en.wikipedia.org/wiki/Wiki_Article_One", "https://en.wikipedia.org/wiki/Wiki_Article_Two"],
];

test("parseWikipediaOpenSearch extracts title, url, snippet from fixture", () => {
  const results = parseWikipediaOpenSearch(WIKIPEDIA_FIXTURE);
  assert.equal(results.length, 2);
  assert.equal(results[0]?.title, "Wiki Article One");
  assert.equal(results[0]?.url, "https://en.wikipedia.org/wiki/Wiki_Article_One");
  assert.equal(results[0]?.snippet, "Description of article one.");
});

test("parseWikipediaOpenSearch returns empty for short or non-array input", () => {
  assert.deepEqual(parseWikipediaOpenSearch(null), []);
  assert.deepEqual(parseWikipediaOpenSearch(["query", ["T"]]), []); // < 4 elements
  assert.deepEqual(parseWikipediaOpenSearch("string"), []);
});

// ── RateLimiter ───────────────────────────────────────────────────────────────

test("RateLimiter allows exactly maxRequests acquisitions within window", () => {
  const limiter = new RateLimiter(3, 60_000);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
});

test("RateLimiter blocks the request beyond maxRequests within window", () => {
  const limiter = new RateLimiter(3, 60_000);
  limiter.tryAcquire();
  limiter.tryAcquire();
  limiter.tryAcquire();
  assert.equal(limiter.tryAcquire(), false);
});

// ── searchWithProviders ───────────────────────────────────────────────────────

function makeProvider(
  name: string,
  searchFn: (query: string, maxResults: number) => Promise<SearchResult[]>,
  maxRequests = 10,
) {
  return { name, rateLimiter: new RateLimiter(maxRequests, 60_000), search: searchFn };
}

const ONE_RESULT: SearchResult = { title: "T", url: "https://result.example.com", snippet: "S" };

test("searchWithProviders returns results from first successful provider", async () => {
  const providers = [
    makeProvider("primary", async () => [ONE_RESULT]),
    makeProvider("fallback", async () => { throw new Error("must not be called"); }),
  ];
  const { results, provider } = await searchWithProviders("q", 5, providers);
  assert.equal(provider, "primary");
  assert.equal(results.length, 1);
});

test("searchWithProviders falls back to next provider when first throws", async () => {
  const providers = [
    makeProvider("primary", async () => { throw new Error("network error"); }),
    makeProvider("fallback", async () => [ONE_RESULT]),
  ];
  const { results, provider } = await searchWithProviders("q", 5, providers);
  assert.equal(provider, "fallback");
  assert.equal(results[0]?.url, ONE_RESULT.url);
});

test("searchWithProviders skips rate-limited provider and falls back", async () => {
  const exhaustedLimiter = new RateLimiter(1, 60_000);
  exhaustedLimiter.tryAcquire(); // consume the single allowed token
  const providers = [
    { name: "primary", rateLimiter: exhaustedLimiter, search: async () => { throw new Error("must not be called"); } },
    makeProvider("fallback", async () => [ONE_RESULT]),
  ];
  const { provider } = await searchWithProviders("q", 5, providers);
  assert.equal(provider, "fallback");
});

test("searchWithProviders throws when all providers fail", async () => {
  const providers = [
    makeProvider("p1", async () => { throw new Error("failed"); }),
    makeProvider("p2", async () => { throw new Error("failed"); }),
  ];
  await assert.rejects(() => searchWithProviders("q", 5, providers));
});

test("searchWithProviders falls through when first provider returns empty results", async () => {
  const providers = [
    makeProvider("primary", async () => []),
    makeProvider("fallback", async () => [ONE_RESULT]),
  ];
  const { results, provider } = await searchWithProviders("q", 5, providers);
  assert.equal(provider, "fallback");
  assert.equal(results.length, 1);
});

test("searchWithProviders returns empty from last successful provider when all return empty", async () => {
  const providers = [
    makeProvider("p1", async () => []),
    makeProvider("p2", async () => []),
  ];
  const { results, provider } = await searchWithProviders("q", 5, providers);
  assert.equal(provider, "p2");
  assert.equal(results.length, 0);
});

test("searchWithProviders trims results to maxResults", async () => {
  const manyResults: SearchResult[] = Array.from({ length: 10 }, (_, i) => ({
    title: `T${i}`, url: `https://r${i}.example.com`, snippet: "S",
  }));
  const providers = [makeProvider("p", async () => manyResults)];
  const { results } = await searchWithProviders("q", 3, providers);
  assert.equal(results.length, 3);
});

// ── decodeBingUrl ─────────────────────────────────────────────────────────────

// "https://example.com/page1" → base64url → "aHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlMQ" → with "a1" prefix
const EXAMPLE_ENCODED = "a1aHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlMQ";

test("decodeBingUrl decodes a known base64url-encoded URL", () => {
  assert.equal(decodeBingUrl(EXAMPLE_ENCODED), "https://example.com/page1");
});

test("decodeBingUrl returns empty string for input shorter than 3 chars", () => {
  assert.equal(decodeBingUrl("a1"), "");
  assert.equal(decodeBingUrl(""), "");
});

test("decodeBingUrl returns empty string for invalid base64", () => {
  assert.equal(decodeBingUrl("a1!!!"), "");
});

// ── parseBingHtml ─────────────────────────────────────────────────────────────

// Construct a minimal fixture using the known encoded values.
// "https://example.com/page1"  → a1aHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlMQ
// "https://other.org/article"  → a1aHR0cHM6Ly9vdGhlci5vcmcvYXJ0aWNsZQ
const BING_HTML_FIXTURE = `
<html><body>
<ol id="b_results">
  <li class="b_algo">
    <h2><a class="tilk" href="https://www.bing.com/ck/a?!&&p=abc&amp;u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlMQ&amp;ntb=1">Example Page One</a></h2>
    <div class="b_caption">
      <p class="b_lineclamp2">Snippet for result one about testing.</p>
    </div>
  </li>
  <li class="b_algo">
    <h2><a class="tilk" href="https://www.bing.com/ck/a?!&&p=xyz&amp;u=a1aHR0cHM6Ly9vdGhlci5vcmcvYXJ0aWNsZQ&amp;ntb=1">Other Article <b>Title</b></a></h2>
    <div class="b_caption">
      <p class="b_lineclamp3">Snippet for result two with more detail.</p>
    </div>
  </li>
</ol>
</body></html>
`;

test("parseBingHtml returns two results from fixture", () => {
  const results = parseBingHtml(BING_HTML_FIXTURE);
  assert.equal(results.length, 2);
});

test("parseBingHtml extracts correct title and URL from first result", () => {
  const results = parseBingHtml(BING_HTML_FIXTURE);
  assert.equal(results[0]?.title, "Example Page One");
  assert.equal(results[0]?.url, "https://example.com/page1");
});

test("parseBingHtml extracts snippet from first result", () => {
  const results = parseBingHtml(BING_HTML_FIXTURE);
  assert.equal(results[0]?.snippet, "Snippet for result one about testing.");
});

test("parseBingHtml strips inner HTML tags from title", () => {
  const results = parseBingHtml(BING_HTML_FIXTURE);
  assert.equal(results[1]?.title, "Other Article Title");
});

test("parseBingHtml decodes HTML-entity-encoded href (&amp;u=)", () => {
  const results = parseBingHtml(BING_HTML_FIXTURE);
  assert.equal(results[1]?.url, "https://other.org/article");
});

test("parseBingHtml returns empty array for HTML with no Bing CK links", () => {
  assert.deepEqual(parseBingHtml("<html><body>nothing here</body></html>"), []);
});
