import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { RateLimiter, searchWithProviders } from "./search-providers.ts";
import type { SearchResult } from "./search-providers.ts";
import { extractContent } from "./content-extractor.ts";
import { addUrls, isAllowed, clear } from "./url-allowlist.ts";

function startServer(html: string): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ url: `http://127.0.0.1:${port}/article`, close: () => server.close() });
    });
  });
}

const ARTICLE_HTML = `
<html>
<head><title>Test Article</title></head>
<body>
  <nav>Navigation noise that should be stripped</nav>
  <article>
    <h1>Test Article Heading</h1>
    <p>This is the main content of the article. It contains useful information about the topic.</p>
    <p>A second paragraph with more detail about the subject matter.</p>
  </article>
  <footer>Footer noise that should be stripped</footer>
</body>
</html>
`;

test("smoke: search result URL is seeded into allow-list", async () => {
  clear();
  const { url, close } = await startServer(ARTICLE_HTML);
  try {
    const mockResult: SearchResult = { title: "Test Article", url, snippet: "Test snippet." };
    const providers = [{ name: "mock", rateLimiter: new RateLimiter(10, 60_000), search: async () => [mockResult] }];

    const { results, provider } = await searchWithProviders("test query", 5, providers);
    assert.equal(provider, "mock");
    assert.equal(results[0]?.url, url);

    addUrls(results.map(r => r.url));
    assert.equal(isAllowed(url), true, "URL from search results must be in allow-list");
  } finally {
    close();
  }
});

test("smoke: fetch_content returns clean article text stripped of nav/footer", async () => {
  const { url, close } = await startServer(ARTICLE_HTML);
  try {
    const extracted = await extractContent(url, 8_000);
    assert.equal(extracted.url, url);
    assert.ok(extracted.content.includes("Test Article Heading"), "content should include h1");
    assert.ok(extracted.content.includes("main content"), "content should include article body");
    assert.ok(!extracted.content.includes("Navigation noise"), "nav should be stripped");
    assert.ok(!extracted.content.includes("Footer noise"), "footer should be stripped");
    assert.equal(extracted.truncated, false);
  } finally {
    close();
  }
});

test("smoke: fetch_content respects token budget and sets truncated flag", async () => {
  const longParagraph = "<p>" + "word ".repeat(6000) + "</p>";
  const longHtml = `<html><body><article><h1>Long Article</h1>${longParagraph}</article></body></html>`;
  const { url, close } = await startServer(longHtml);
  try {
    const maxTokens = 200;
    const extracted = await extractContent(url, maxTokens);
    assert.equal(extracted.truncated, true, "long content must be truncated");
    // Allow 20% slack on the approximation
    assert.ok(extracted.contentTokensApprox <= Math.ceil(maxTokens * 1.2), `token count ${extracted.contentTokensApprox} exceeds budget`);
  } finally {
    close();
  }
});
