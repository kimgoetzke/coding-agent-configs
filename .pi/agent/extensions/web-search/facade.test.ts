import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { fetchRaw, BYTE_LIMIT } from "./fetch.ts";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function withServer(handler: Handler, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Tracer bullet: fetchRaw is the shared core used by both web_search and fetch_content.
// These tests verify the fetch plumbing that both tools depend on.

test("fetchRaw returns response body from local server", async () => {
  const html = "<html><body>Hello, world!</body></html>";
  await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    },
    async (baseUrl) => {
      const result = await fetchRaw(baseUrl);
      assert.equal(result.ok, true);
      assert.equal(result.body, html);
    },
  );
});

test("fetchRaw truncates body at BYTE_LIMIT bytes", async () => {
  const oversize = "x".repeat(BYTE_LIMIT + 1000);
  await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(oversize);
    },
    async (baseUrl) => {
      const result = await fetchRaw(baseUrl);
      assert.equal(result.ok, true);
      assert.equal(result.body.length, BYTE_LIMIT);
    },
  );
});

test("fetchRaw sets ok false for non-2xx responses", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    },
    async (baseUrl) => {
      const result = await fetchRaw(baseUrl);
      assert.equal(result.ok, false);
      assert.equal(result.body, "Not Found");
    },
  );
});
