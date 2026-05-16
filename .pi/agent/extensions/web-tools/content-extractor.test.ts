import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  applyTokenBudget,
  extractFromHtml,
  extractContent,
  isLikelyJSRendered,
} from "./content-extractor.ts";

// ── applyTokenBudget ──────────────────────────────────────────────────────────

test("applyTokenBudget returns text unchanged when under budget", () => {
  const text = "short text";
  const result = applyTokenBudget(text, 100);
  assert.equal(result.content, text);
  assert.equal(result.truncated, false);
});

test("applyTokenBudget truncates at paragraph boundary and appends tail marker", () => {
  // budget = 10 tokens = 40 chars; two paragraphs with a \n\n break at char 20
  const para1 = "a".repeat(20);
  const para2 = "b".repeat(40);
  const text = `${para1}\n\n${para2}`;
  const result = applyTokenBudget(text, 10);
  assert.equal(result.truncated, true);
  assert.ok(result.content.startsWith(para1), "should keep first paragraph");
  assert.match(result.content, /…\[truncated:/);
});

test("applyTokenBudget hard-truncates when no paragraph break exists within budget", () => {
  // budget = 5 tokens = 20 chars; 60-char string with no \n\n
  const text = "x".repeat(60);
  const result = applyTokenBudget(text, 5);
  assert.equal(result.truncated, true);
  assert.match(result.content, /…\[truncated:/);
});

// ── extractFromHtml ───────────────────────────────────────────────────────────

const NOISY_HTML_FIXTURE = `<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <header><h1>Site Name</h1></header>
  <aside>Advertisement: Buy now!</aside>
  <article>
    <h1>The Real Article Title</h1>
    <p>This is the first paragraph of real content. It has enough text to be
    recognised as the main article body by the Readability algorithm.</p>
    <p>This is the second paragraph. It also contains meaningful prose that
    should be extracted cleanly and returned to the agent without nav clutter.</p>
    <p>And a third paragraph to give Readability enough signal to extract the article.</p>
  </article>
  <footer>Copyright 2024. Privacy policy. Terms of service.</footer>
</body>
</html>`;

test("extractFromHtml extracts article prose and excludes nav/footer boilerplate", () => {
  const { markdown } = extractFromHtml(NOISY_HTML_FIXTURE, "https://example.com/article");
  assert.ok(markdown.includes("first paragraph of real content"), "main content missing");
  assert.ok(!markdown.includes("Home"), "nav link leaked");
  assert.ok(!markdown.includes("Advertisement"), "ad leaked");
  assert.ok(!markdown.includes("Copyright 2024"), "footer leaked");
});

const STRUCTURE_HTML_FIXTURE = `<!DOCTYPE html>
<html>
<head><title>Structure Test</title></head>
<body>
<article>
  <h1>Top Heading</h1>
  <p>Intro paragraph with <a href="https://example.com">a link</a> inside.</p>
  <h2>Sub Heading</h2>
  <p>Paragraph under sub heading.</p>
  <ul>
    <li>List item one</li>
    <li>List item two</li>
  </ul>
  <pre><code>const x = 1;
const y = 2;</code></pre>
  <p>Final paragraph.</p>
</article>
</body>
</html>`;

test("extractFromHtml preserves h1/h2 headings as markdown headers", () => {
  const { markdown } = extractFromHtml(STRUCTURE_HTML_FIXTURE, "https://example.com/");
  assert.ok(
    markdown.includes("# Top Heading") || markdown.includes("## Top Heading"),
    "h1 not in markdown",
  );
  assert.ok(
    markdown.includes("## Sub Heading") || markdown.includes("### Sub Heading"),
    "h2 not in markdown",
  );
});

test("extractFromHtml preserves links as [text](url)", () => {
  const { markdown } = extractFromHtml(STRUCTURE_HTML_FIXTURE, "https://example.com/");
  assert.ok(markdown.includes("[a link](https://example.com)"), "link not preserved");
});

test("extractFromHtml preserves code blocks as fenced markdown", () => {
  const { markdown } = extractFromHtml(STRUCTURE_HTML_FIXTURE, "https://example.com/");
  assert.ok(markdown.includes("```"), "fenced code block missing");
  assert.ok(markdown.includes("const x = 1;"), "code content missing");
});

// ── isLikelyJSRendered ────────────────────────────────────────────────────────

test("isLikelyJSRendered returns true when markdown is thin and html has many script tags", () => {
  const thinMarkdown = "a".repeat(100);
  const scriptHeavyHtml =
    "<script></script><script></script><script></script><script></script><div></div>";
  assert.equal(isLikelyJSRendered(thinMarkdown, scriptHeavyHtml), true);
});

test("isLikelyJSRendered returns false when markdown is thin but html has few script tags", () => {
  const thinMarkdown = "a".repeat(100);
  const lightHtml = "<script></script><div>content</div>";
  assert.equal(isLikelyJSRendered(thinMarkdown, lightHtml), false);
});

test("isLikelyJSRendered returns false when html has many scripts but markdown is rich", () => {
  const richMarkdown = "a".repeat(600);
  const scriptHeavyHtml =
    "<script></script><script></script><script></script><script></script><div></div>";
  assert.equal(isLikelyJSRendered(richMarkdown, scriptHeavyHtml), false);
});

// ── extractContent (network) ──────────────────────────────────────────────────

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
      });
    });
  });
}

test("extractContent includes rawHtml for HTML responses", async () => {
  const html = `<!DOCTYPE html><html><body><article><p>${"x".repeat(600)}</p></article></body></html>`;
  const { url, close } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  try {
    const result = await extractContent(url, 8_000);
    assert.ok(result.rawHtml !== undefined, "rawHtml should be present for HTML responses");
    assert.ok(result.rawHtml!.includes("<body>"), "rawHtml should contain raw HTML");
  } finally {
    close();
  }
});

test("extractContent returns plain-text body verbatim for non-HTML responses", async () => {
  const plainText = "This is plain text content, not HTML.";
  const { url, close } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(plainText);
  });
  try {
    const result = await extractContent(url, 8_000);
    assert.ok(result.content.includes(plainText), "plain text body not returned verbatim");
    assert.equal(result.truncated, false);
  } finally {
    close();
  }
});

test("extractContent aborts when the server is slow and signal times out", async () => {
  const { url, close } = await startServer((_req, _res) => {
    // Never respond — hold the connection open.
  });
  try {
    const signal = AbortSignal.timeout(50);
    await assert.rejects(
      () => extractContent(url, 8_000, signal),
      (err: Error) => err.name === "TimeoutError" || err.name === "AbortError",
    );
  } finally {
    close();
  }
});
