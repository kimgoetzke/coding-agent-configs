import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  parseGitHubUrl,
  buildRawUrl,
  buildApiTreeUrl,
  formatFileTree,
  fetchGitHubContent,
  clearCloneCache,
} from "./github-router.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── parseGitHubUrl ────────────────────────────────────────────────────────────

test("parseGitHubUrl returns null for non-GitHub URLs", () => {
  assert.equal(parseGitHubUrl("https://example.com/path"), null);
  assert.equal(parseGitHubUrl("not-a-url"), null);
  assert.equal(parseGitHubUrl("https://gitlab.com/owner/repo"), null);
});

test("parseGitHubUrl parses root repo URL", () => {
  const result = parseGitHubUrl("https://github.com/owner/repo");
  assert.deepEqual(result, { owner: "owner", repo: "repo", type: "root" });
});

test("parseGitHubUrl parses blob URL with nested path", () => {
  const result = parseGitHubUrl("https://github.com/owner/repo/blob/main/src/index.ts");
  assert.deepEqual(result, { owner: "owner", repo: "repo", ref: "main", type: "blob", path: "src/index.ts" });
});

test("parseGitHubUrl parses tree URL with path", () => {
  const result = parseGitHubUrl("https://github.com/owner/repo/tree/main/src");
  assert.deepEqual(result, { owner: "owner", repo: "repo", ref: "main", type: "tree", path: "src" });
});

test("parseGitHubUrl parses tree URL without path", () => {
  const result = parseGitHubUrl("https://github.com/owner/repo/tree/main");
  assert.deepEqual(result, { owner: "owner", repo: "repo", ref: "main", type: "tree" });
});

// ── buildRawUrl ───────────────────────────────────────────────────────────────

test("buildRawUrl constructs raw.githubusercontent.com URL", () => {
  const descriptor = { owner: "owner", repo: "repo", ref: "main", type: "blob" as const, path: "src/index.ts" };
  assert.equal(
    buildRawUrl(descriptor),
    "https://raw.githubusercontent.com/owner/repo/main/src/index.ts",
  );
});

// ── buildApiTreeUrl ───────────────────────────────────────────────────────────

test("buildApiTreeUrl constructs GitHub API tree URL with recursive flag", () => {
  const descriptor = { owner: "owner", repo: "repo", ref: "main", type: "tree" as const };
  assert.equal(
    buildApiTreeUrl(descriptor),
    "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
  );
});

// ── formatFileTree ────────────────────────────────────────────────────────────

test("formatFileTree includes all entry paths within budget", () => {
  const entries = [
    { path: "src/index.ts", type: "blob" },
    { path: "src/utils.ts", type: "blob" },
    { path: "README.md", type: "blob" },
  ];
  const result = formatFileTree(entries, 1000);
  assert.ok(result.includes("index.ts"), "index.ts missing");
  assert.ok(result.includes("utils.ts"), "utils.ts missing");
  assert.ok(result.includes("README.md"), "README.md missing");
});

test("formatFileTree truncates and appends omission marker when over budget", () => {
  const entries = Array.from({ length: 500 }, (_, i) => ({
    path: `dir/file-${String(i).padStart(3, "0")}.ts`,
    type: "blob",
  }));
  const result = formatFileTree(entries, 10); // ~40 chars budget
  assert.ok(result.includes("…["), "truncation marker missing");
  assert.ok(result.length < 500 * 20, "result far too long");
});

// ── fetchGitHubContent: blob path ─────────────────────────────────────────────

test("fetchGitHubContent returns raw file content for blob path", async () => {
  const fileContent = 'export const answer = 42;\n';
  const { url: serverBase, close } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(fileContent);
  });

  try {
    const descriptor = parseGitHubUrl("https://github.com/owner/repo/blob/main/src/index.ts")!;
    const result = await fetchGitHubContent(descriptor, 8000, undefined, { rawBase: serverBase });
    assert.ok(result.content.includes("answer = 42"), "file content not in result");
    assert.equal(result.title, "src/index.ts");
    assert.equal(result.truncated, false);
  } finally {
    close();
  }
});

// ── fetchGitHubContent: tree path ─────────────────────────────────────────────

test("fetchGitHubContent returns directory listing for tree path", async () => {
  const treeResponse = JSON.stringify({
    tree: [
      { path: "src", type: "tree" },
      { path: "src/index.ts", type: "blob" },
      { path: "src/utils.ts", type: "blob" },
      { path: "README.md", type: "blob" },
    ],
  });

  const { url: apiBase, close } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(treeResponse);
  });

  try {
    const descriptor = parseGitHubUrl("https://github.com/owner/repo/tree/main/src")!;
    const result = await fetchGitHubContent(descriptor, 8000, undefined, { apiBase });
    assert.ok(result.content.includes("index.ts"), "index.ts missing from listing");
    assert.ok(result.content.includes("utils.ts"), "utils.ts missing from listing");
    assert.ok(!result.content.includes("README.md"), "README.md should be filtered out (not under src/)");
  } finally {
    close();
  }
});

// ── fetchGitHubContent: root path (large repo → API fallback) ─────────────────

test("fetchGitHubContent returns file tree and README for root URL of large repo", async () => {
  const repoMeta = JSON.stringify({ size: 400_000, default_branch: "main" }); // 400 MB → API path
  const treeResponse = JSON.stringify({
    tree: [
      { path: "src", type: "tree" },
      { path: "src/index.ts", type: "blob" },
      { path: "README.md", type: "blob" },
    ],
  });
  const readmeContent = "# My Project\n\nThis is the README.";

  const { url: serverBase, close } = await startServer((req, res) => {
    if (req.url?.includes("/git/trees/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(treeResponse);
    } else if (req.url?.includes("README.md")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(readmeContent);
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(repoMeta);
    }
  });

  try {
    const descriptor = parseGitHubUrl("https://github.com/owner/repo")!;
    const result = await fetchGitHubContent(descriptor, 8000, undefined, {
      apiBase: serverBase,
      rawBase: serverBase,
    });
    assert.ok(result.content.includes("index.ts"), "file tree missing");
    assert.ok(result.content.includes("My Project"), "README missing");
  } finally {
    close();
  }
});

// ── fetchGitHubContent: private repo error ─────────────────────────────────────

test("fetchGitHubContent throws helpful error when repo is private and gh unavailable", async () => {
  const { url: serverBase, close } = await startServer((_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Requires authentication" }));
  });

  try {
    const descriptor = parseGitHubUrl("https://github.com/private/repo/blob/main/file.ts")!;
    await assert.rejects(
      () => fetchGitHubContent(descriptor, 8000, undefined, {
        rawBase: serverBase,
        getToken: async () => null,
      }),
      (err: Error) => err.message.includes("gh auth login"),
    );
  } finally {
    close();
  }
});

// ── clearCloneCache ───────────────────────────────────────────────────────────

test("clearCloneCache empties the cache without throwing", () => {
  clearCloneCache();
  assert.ok(true);
});
