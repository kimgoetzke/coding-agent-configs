/**
 * GitHub URL router for fetch_content.
 *
 * Routes github.com URLs to repository content via the GitHub API or a
 * shallow clone, instead of HTML scraping. Supports three URL shapes:
 *   - Root repo (github.com/<owner>/<repo>): file tree + README
 *   - Directory (/tree/<ref>/<path>): GitHub API recursive tree
 *   - File (/blob/<ref>/<path>): raw.githubusercontent.com content
 *
 * Root repos below SIZE_THRESHOLD_MB are cloned with --depth 1; larger repos
 * use the API tree endpoint. Clone directories are cached per session and
 * purged on clearCloneCache().
 *
 * Private repos: attempts public access first; falls back to `gh auth token`
 * when a 401/403 is received. If `gh` is unavailable or unauthenticated,
 * throws with a helpful message.
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, statSync, rmSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

import type { ExtractionResult } from "./content-extractor.ts";
import { applyTokenBudget } from "./content-extractor.ts";

export type GitHubUrlDescriptor = {
  owner: string;
  repo: string;
  ref?: string;
  type: "root" | "tree" | "blob";
  path?: string;
};

export interface GitHubFetchOptions {
  apiBase?: string;
  rawBase?: string;
  sizeThresholdMb?: number;
  cloneTimeoutMs?: number;
  /** Override clone operation — used in tests to simulate clone failures. */
  cloneRepo?: (cloneUrl: string, cloneDir: string, signal: AbortSignal, timeoutMs: number) => Promise<void>;
  /** Override token getter — used in tests to simulate gh CLI absence. */
  getToken?: () => Promise<string | null>;
}

const SIZE_THRESHOLD_MB = 350;
const DEFAULT_CLONE_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; pi-web-tools/1.0)";
const CHARS_PER_TOKEN = 4;

// ── URL parsing ───────────────────────────────────────────────────────────────

export function parseGitHubUrl(url: string): GitHubUrlDescriptor | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1];

  if (segments.length === 2) {
    return { owner, repo, type: "root" };
  }

  const urlType = segments[2];
  if (urlType !== "tree" && urlType !== "blob") return null;
  if (segments.length < 4) return null;

  const ref = segments[3];
  const descriptor: GitHubUrlDescriptor = { owner, repo, ref, type: urlType };
  if (segments.length > 4) {
    descriptor.path = segments.slice(4).join("/");
  }
  return descriptor;
}

// ── URL builders ──────────────────────────────────────────────────────────────

export function buildRawUrl(descriptor: GitHubUrlDescriptor): string {
  const { owner, repo, ref = "HEAD", path = "" } = descriptor;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
}

export function buildApiTreeUrl(descriptor: GitHubUrlDescriptor): string {
  const { owner, repo, ref = "HEAD" } = descriptor;
  return `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
}

// ── File tree formatting ──────────────────────────────────────────────────────

export function formatFileTree(
  entries: { path: string; type: string }[],
  maxTokens: number,
): string {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const charBudget = maxTokens * CHARS_PER_TOKEN;

  const lines: string[] = [];
  let usedChars = 0;
  let included = 0;

  for (const entry of sorted) {
    const depth = entry.path.split("/").length - 1;
    const indent = "  ".repeat(depth);
    const name = entry.path.split("/").at(-1) ?? entry.path;
    const suffix = entry.type === "tree" ? "/" : "";
    const line = `${indent}${name}${suffix}`;
    const lineWithNewline = line + "\n";

    if (usedChars + lineWithNewline.length > charBudget) break;
    lines.push(line);
    usedChars += lineWithNewline.length;
    included++;
  }

  const omitted = sorted.length - included;
  if (omitted > 0) {
    lines.push(`…[${omitted} more entries omitted]`);
  }

  return lines.join("\n");
}

// ── Clone cache ───────────────────────────────────────────────────────────────

const cloneCache = new Map<string, string>();

export function getCloneCache(): Map<string, string> {
  return cloneCache;
}

export function clearCloneCache(): void {
  for (const [, dir] of cloneCache) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
  cloneCache.clear();
}

// ── Private helpers ───────────────────────────────────────────────────────────

export async function getGhToken(): Promise<string | null> {
  try {
    const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
    return token || null;
  } catch {
    return null;
  }
}

async function githubFetch(
  url: string,
  signal: AbortSignal,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "Accept": "application/vnd.github+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { headers, signal });
}

async function cloneRepository(
  cloneUrl: string,
  cloneDir: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (signal.aborted) throw new Error("GitHub clone aborted");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    const child = spawn("git", ["clone", "--depth", "1", cloneUrl, cloneDir], {
      stdio: "ignore",
    });

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (abortHandler) signal.removeEventListener("abort", abortHandler);
      if (error) reject(error);
      else resolve();
    };

    abortHandler = () => {
      child.kill("SIGKILL");
      finish(new Error("GitHub clone aborted"));
    };

    timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish(new Error("GitHub clone timed out"));
    }, timeoutMs);
    timeoutId.unref?.();

    signal.addEventListener("abort", abortHandler, { once: true });

    child.on("error", (error) => finish(error));
    child.on("exit", (code) => {
      if (code === 0) {
        finish();
      } else if (timedOut) {
        finish(new Error("GitHub clone timed out"));
      } else if (signal.aborted) {
        finish(new Error("GitHub clone aborted"));
      } else {
        finish(new Error(`GitHub clone failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

async function runCloneWithDeadline(
  cloneRepo: NonNullable<GitHubFetchOptions["cloneRepo"]>,
  cloneUrl: string,
  cloneDir: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (signal.aborted) throw new Error("GitHub clone aborted");

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;

  try {
    const deadline = new Promise<never>((_, reject) => {
      const rejectOnce = (error: Error) => {
        if (!controller.signal.aborted) controller.abort(error);
        reject(error);
      };

      timeoutId = setTimeout(
        () => rejectOnce(new Error("GitHub clone timed out")),
        timeoutMs,
      );
      timeoutId.unref?.();

      abortHandler = () => rejectOnce(new Error("GitHub clone aborted"));
      signal.addEventListener("abort", abortHandler, { once: true });
    });

    await Promise.race([
      cloneRepo(cloneUrl, cloneDir, controller.signal, timeoutMs),
      deadline,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
  }
}

function walkDirectory(dir: string, base: string): { path: string; type: string }[] {
  const entries: { path: string; type: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const relPath = relative(base, full);
    let isDir: boolean;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    entries.push({ path: relPath, type: isDir ? "tree" : "blob" });
    if (isDir) entries.push(...walkDirectory(full, base));
  }
  return entries;
}

function readReadme(cloneDir: string, entries: { path: string; type: string }[]): string {
  const readmeEntry = entries.find(
    (e) => e.type === "blob" && /^readme(\.(md|txt|rst))?$/i.test(e.path),
  );
  if (!readmeEntry) return "";
  try {
    return readFileSync(join(cloneDir, readmeEntry.path), "utf8");
  } catch {
    return "";
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function fetchGitHubContent(
  descriptor: GitHubUrlDescriptor,
  maxTokens: number,
  signal?: AbortSignal,
  options: GitHubFetchOptions = {},
): Promise<ExtractionResult> {
  const {
    apiBase = "https://api.github.com",
    rawBase = "https://raw.githubusercontent.com",
    sizeThresholdMb = SIZE_THRESHOLD_MB,
    cloneTimeoutMs = DEFAULT_CLONE_TIMEOUT_MS,
    cloneRepo = cloneRepository,
    getToken = getGhToken,
  } = options;

  const effectiveSignal = signal ?? AbortSignal.timeout(30_000);

  async function fetchWithPrivateFallback(url: string): Promise<Response> {
    const resp = await githubFetch(url, effectiveSignal);
    if (resp.status === 401 || resp.status === 403) {
      const token = await getToken();
      if (!token) {
        throw new Error(
          "Repository appears private. Run `gh auth login` to enable access.",
        );
      }
      return githubFetch(url, effectiveSignal, token);
    }
    return resp;
  }

  // ── Blob: raw file content ─────────────────────────────────────────────────

  if (descriptor.type === "blob") {
    const rawUrl = `${rawBase}/${descriptor.owner}/${descriptor.repo}/${descriptor.ref ?? "HEAD"}/${descriptor.path ?? ""}`;
    const resp = await fetchWithPrivateFallback(rawUrl);
    if (!resp.ok) throw new Error(`Failed to fetch raw file: HTTP ${resp.status}`);

    const rawText = await resp.text();
    const { content, truncated } = applyTokenBudget(rawText, maxTokens);
    return {
      url: rawUrl,
      title: descriptor.path ?? null,
      content,
      contentTokensApprox: Math.round(content.length / 4),
      truncated,
      source: "github-api",
    };
  }

  // ── Tree: directory listing ────────────────────────────────────────────────

  if (descriptor.type === "tree") {
    const ref = descriptor.ref ?? "HEAD";
    const treeApiUrl = `${apiBase}/repos/${descriptor.owner}/${descriptor.repo}/git/trees/${ref}?recursive=1`;
    const resp = await fetchWithPrivateFallback(treeApiUrl);
    if (!resp.ok) throw new Error(`Failed to fetch directory listing: HTTP ${resp.status}`);

    const data = await resp.json() as { tree?: { path: string; type: string }[] };
    const allEntries = data.tree ?? [];
    const filtered = descriptor.path
      ? allEntries.filter(
          (e) => e.path === descriptor.path || e.path.startsWith(descriptor.path + "/"),
        )
      : allEntries;

    const content = formatFileTree(filtered, maxTokens);
    return {
      url: `https://github.com/${descriptor.owner}/${descriptor.repo}/tree/${ref}/${descriptor.path ?? ""}`,
      title: `${descriptor.owner}/${descriptor.repo}: ${descriptor.path ?? ref}`,
      content,
      contentTokensApprox: Math.round(content.length / 4),
      truncated: false,
      source: "github-api",
    };
  }

  // ── Root: file tree + README ───────────────────────────────────────────────

  const repoApiUrl = `${apiBase}/repos/${descriptor.owner}/${descriptor.repo}`;
  const repoResp = await fetchWithPrivateFallback(repoApiUrl);
  if (!repoResp.ok) throw new Error(`Failed to fetch repo metadata: HTTP ${repoResp.status}`);

  const repoData = await repoResp.json() as { size?: number; default_branch?: string };
  const sizeMb = (repoData.size ?? 0) / 1024; // GitHub API returns size in KB
  const defaultBranch = repoData.default_branch ?? "main";

  async function fetchRootViaApi(): Promise<{
    allEntries: { path: string; type: string }[];
    readme: string;
    rootSource: "github-api";
  }> {
    const treeApiUrl = `${apiBase}/repos/${descriptor.owner}/${descriptor.repo}/git/trees/${defaultBranch}?recursive=1`;
    const treeResp = await fetchWithPrivateFallback(treeApiUrl);
    if (!treeResp.ok) throw new Error(`Failed to fetch tree: HTTP ${treeResp.status}`);

    const treeData = await treeResp.json() as { tree?: { path: string; type: string }[] };
    const allEntries = treeData.tree ?? [];
    let readme = "";

    const readmeEntry = allEntries.find(
      (e) => e.type === "blob" && /^readme(\.(md|txt|rst))?$/i.test(e.path),
    );
    if (readmeEntry) {
      const readmeUrl = `${rawBase}/${descriptor.owner}/${descriptor.repo}/${defaultBranch}/${readmeEntry.path}`;
      try {
        const readmeResp = await fetch(readmeUrl, {
          headers: { "User-Agent": USER_AGENT },
          signal: effectiveSignal,
        });
        if (readmeResp.ok) readme = await readmeResp.text();
      } catch {
        // README fetch is best-effort — proceed without it
      }
    }

    return { allEntries, readme, rootSource: "github-api" };
  }

  let rootData: {
    allEntries: { path: string; type: string }[];
    readme: string;
    rootSource: "github-clone" | "github-api";
  };

  if (sizeMb <= sizeThresholdMb) {
    const cacheKey = `${descriptor.owner}/${descriptor.repo}`;
    let cloneDir = cloneCache.get(cacheKey);
    try {
      if (!cloneDir) {
        cloneDir = mkdtempSync(join(tmpdir(), "pi-github-cache-"));
        const cloneUrl = `https://github.com/${descriptor.owner}/${descriptor.repo}.git`;
        await runCloneWithDeadline(cloneRepo, cloneUrl, cloneDir, effectiveSignal, cloneTimeoutMs);
        cloneCache.set(cacheKey, cloneDir);
      }
      const allEntries = walkDirectory(cloneDir, cloneDir).filter((e) => !e.path.startsWith(".git"));
      rootData = {
        allEntries,
        readme: readReadme(cloneDir, allEntries),
        rootSource: "github-clone",
      };
    } catch (error) {
      if (cloneDir && !cloneCache.has(cacheKey)) rmSync(cloneDir, { recursive: true, force: true });
      if (error instanceof Error && error.message === "GitHub clone aborted") throw error;
      rootData = await fetchRootViaApi();
    }
  } else {
    rootData = await fetchRootViaApi();
  }

  const { allEntries, readme, rootSource } = rootData;

  const halfBudget = Math.floor(maxTokens / 2);
  const treeText = formatFileTree(allEntries, halfBudget);
  const { content: readmeContent } = applyTokenBudget(readme, maxTokens - halfBudget);
  const combined = `# File Tree\n\n${treeText}\n\n# README\n\n${readmeContent}`.trimEnd();

  return {
    url: `https://github.com/${descriptor.owner}/${descriptor.repo}`,
    title: `${descriptor.owner}/${descriptor.repo}`,
    content: combined,
    contentTokensApprox: Math.round(combined.length / 4),
    truncated: false,
    source: rootSource,
  };
}
