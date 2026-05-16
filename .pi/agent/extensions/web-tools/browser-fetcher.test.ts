import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { after, test } from "node:test";
import assert from "node:assert/strict";

import {
  closeBrowserSession,
  fetchWithBrowser,
  getBrowserSession,
  prewarmBrowserSession,
} from "./browser-fetcher.ts";

function startTestServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${address.port}`, server });
    });
  });
}

function closeTestServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// Ensure no browser lingers after this file finishes.
after(async () => {
  await closeBrowserSession();
});

test("closeBrowserSession on a fresh session resolves without error", async () => {
  await assert.doesNotReject(() => closeBrowserSession());
});

test("getBrowserSession returns a connected browser", async () => {
  const browser = await getBrowserSession();
  assert.ok(typeof browser.newContext === "function", "browser has newContext method");
  await closeBrowserSession();
});

test("getBrowserSession returns the same instance on repeated calls", async () => {
  const first = await getBrowserSession();
  const second = await getBrowserSession();
  assert.strictEqual(first, second);
  await closeBrowserSession();
});

test("after closeBrowserSession, getBrowserSession creates a new instance", async () => {
  const first = await getBrowserSession();
  await closeBrowserSession();
  const second = await getBrowserSession();
  assert.notStrictEqual(first, second);
  await closeBrowserSession();
});

test("prewarmBrowserSession is idempotent and does not throw", async () => {
  prewarmBrowserSession();
  prewarmBrowserSession();
  // Allow microtasks to settle so the fire-and-forget promises complete.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await closeBrowserSession();
});

// ── fetchWithBrowser ──────────────────────────────────────────────────────────

test("fetchWithBrowser returns browser-html source for a basic page", async () => {
  const { url, server } = await startTestServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><head><title>Test</title></head><body><p>Hello from browser</p></body></html>");
  });
  try {
    const result = await fetchWithBrowser(url);
    assert.strictEqual(result.source, "browser-html");
    assert.ok(result.content.length > 0);
  } finally {
    await closeTestServer(server);
  }
});

test("fetchWithBrowser captures JavaScript-injected content", async () => {
  const html = `<html><head><title>SPA Test</title></head><body>
<main><p id="content">Static text in markup</p></main>
<script>document.getElementById('content').textContent = 'Browser-injected dynamic text';</script>
</body></html>`;

  const { url, server } = await startTestServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  try {
    const result = await fetchWithBrowser(url);
    assert.ok(
      result.content.includes("Browser-injected dynamic text"),
      `expected injected text in content, got: ${result.content.slice(0, 200)}`,
    );
  } finally {
    await closeTestServer(server);
  }
});

test("fetchWithBrowser uses a fresh context per call so cookies do not leak between fetches", async () => {
  const { url, server } = await startTestServer((req, res) => {
    if (req.url === "/set-cookie") {
      res.writeHead(200, {
        "Content-Type": "text/html",
        "Set-Cookie": "session=secret-value; Path=/",
      });
      res.end("<html><body><p>Cookie set</p></body></html>");
    } else {
      const cookies = req.headers.cookie ?? "no cookies received";
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><p>${cookies}</p></body></html>`);
    }
  });
  try {
    await fetchWithBrowser(`${url}/set-cookie`);
    const secondResult = await fetchWithBrowser(`${url}/check-cookies`);
    assert.ok(
      !secondResult.content.includes("secret-value"),
      `expected no leaked cookie, got: ${secondResult.content.slice(0, 200)}`,
    );
  } finally {
    await closeTestServer(server);
  }
});

test("fetchWithBrowser returns a result when networkidle times out", async () => {
  const html = `<html><head><title>Polling Page</title></head><body>
<main><p>Content loaded</p></main>
<script>setInterval(() => fetch('/ping').catch(() => {}), 200);</script>
</body></html>`;

  const { url, server } = await startTestServer((req, res) => {
    if (req.url === "/ping") {
      res.writeHead(200);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  try {
    // Use a short networkidle timeout (1 s) so the test does not take 15 s.
    const result = await fetchWithBrowser(url, 8_000, undefined, undefined, 1_000);
    assert.strictEqual(result.source, "browser-html");
    assert.ok(result.content.length > 0);
  } finally {
    await closeTestServer(server);
  }
});

test("fetchWithBrowser falls back to static extraction when the browser has crashed", async () => {
  const { url, server } = await startTestServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<html><head><title>Fallback</title></head><body><p>Static fallback content</p></body></html>",
    );
  });

  // Simulate a browser crash: close the underlying browser process directly,
  // leaving the module-level singleton pointing to the now-disconnected instance.
  const browser = await getBrowserSession();
  await browser.close();

  try {
    const result = await fetchWithBrowser(url);
    assert.strictEqual(result.source, "html");
    assert.ok(result.content.length > 0);
  } finally {
    await closeTestServer(server);
    // closeBrowserSession checks isConnected() so it handles the already-closed browser.
    await closeBrowserSession();
  }
});
