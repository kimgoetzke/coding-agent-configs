export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export interface ProviderAttempt {
  name: string;
  outcome: "success" | "rate_limited" | "skipped" | "empty" | "error";
  resultCount?: number;
  skipReason?: string;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

export class RateLimiter {
  private readonly timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  tryAcquire(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && (this.timestamps[0] as number) < cutoff) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxRequests) return false;
    this.timestamps.push(now);
    return true;
  }
}

// ── Shared HTML/text utilities ────────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ── DuckDuckGo HTML parser ────────────────────────────────────────────────────

function extractDdgUrl(href: string): string | null {
  try {
    const match = href.match(/[?&]uddg=([^&]+)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
    if (href.startsWith("http")) return href;
    return null;
  } catch {
    return null;
  }
}

/**
 * Parses a DuckDuckGo HTML SERP body into structured results.
 * Pairs result__a anchors (title + redirect URL) with result__snippet elements.
 */
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const hrefAttrRegex = /\bhref="([^"]+)"/;

  // Find all <a> opening tags that carry class="result__a"
  // Note: no trailing \b after the closing " — " is non-word so boundary won't fire
  const tagRegex = /<a\b[^>]*class="result__a"[^>]*>/g;
  const titleEntries: Array<{ url: string; title: string }> = [];
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = tagRegex.exec(html)) !== null) {
    const hrefMatch = hrefAttrRegex.exec(tagMatch[0]);
    if (!hrefMatch || !hrefMatch[1]) continue;
    const url = extractDdgUrl(hrefMatch[1]);
    if (!url) continue;
    const tagEnd = tagMatch.index + tagMatch[0].length;
    const closeIndex = html.indexOf("</a>", tagEnd);
    if (closeIndex === -1) continue;
    const title = stripHtmlTags(html.slice(tagEnd, closeIndex));
    if (title) titleEntries.push({ url, title });
  }

  // Capture tag name so the backreference \1 matches the correct closing tag,
  // preventing lazy [\s\S]*? from stopping early at inner tags like </b>.
  const snippetRegex = /<([a-z]+)\b[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/\1>/g;
  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;

  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtmlTags(snippetMatch[2] ?? ""));
  }

  return titleEntries.map((entry, i) => ({
    title: entry.title,
    url: entry.url,
    snippet: snippets[i] ?? "",
  }));
}

// ── Bing HTML parser ──────────────────────────────────────────────────────────

/**
 * Decodes a Bing click-tracking URL parameter value.
 * Bing encodes the destination URL as base64url with a 2-char "a1" prefix.
 */
export function decodeBingUrl(encoded: string): string {
  try {
    const b64 = encoded.slice(2);
    if (!b64) return "";
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Parses a Bing HTML SERP body into structured results.
 * Extracts title and click-tracking URL from h2 anchors; snippet from b_lineclamp paragraphs.
 */
export function parseBingHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const titleRegex = /<h2[^>]*><a\b[^>]*href="(https:\/\/www\.bing\.com\/ck\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  for (const m of html.matchAll(titleRegex)) {
    const rawHref = (m[1] ?? "").replace(/&amp;/g, "&");
    const uParam = rawHref.match(/[?&]u=([A-Za-z0-9_-]+)/)?.[1];
    const url = uParam ? decodeBingUrl(uParam) : "";
    if (!url.startsWith("http")) continue;

    const title = stripHtmlTags(m[2] ?? "");
    if (!title) continue;

    const after = html.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 2000);
    const snipMatch = after.match(/<p\b[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const snippet = stripHtmlTags(snipMatch?.[1] ?? "");

    results.push({ title, url, snippet });
  }
  return results;
}

// ── SearXNG JSON parser ───────────────────────────────────────────────────────

/**
 * Parses a SearXNG `/search?format=json` response body.
 * Expected shape: `{ results: Array<{ title, url, content, publishedDate? }> }`
 */
export function parseSearXNGJson(data: unknown): SearchResult[] {
  if (!data || typeof data !== "object" || !Array.isArray((data as Record<string, unknown>).results)) {
    return [];
  }
  const results: SearchResult[] = [];
  for (const item of (data as Record<string, unknown[]>).results) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title : "";
    const url = typeof r.url === "string" ? r.url : "";
    const snippet = typeof r.content === "string" ? r.content : "";
    const date = typeof r.publishedDate === "string" ? r.publishedDate : undefined;
    if (!title || !url) continue;
    results.push({ title, url, snippet, ...(date !== undefined ? { date } : {}) });
  }
  return results;
}

// ── Wikipedia OpenSearch parser ───────────────────────────────────────────────

/**
 * Parses a Wikipedia OpenSearch API response.
 * Format: `[query, [titles], [descriptions], [urls]]`
 */
export function parseWikipediaOpenSearch(data: unknown): SearchResult[] {
  if (!Array.isArray(data) || data.length < 4) return [];
  const titles = data[1];
  const descriptions = data[2];
  const urls = data[3];
  if (!Array.isArray(titles) || !Array.isArray(urls)) return [];
  const results: SearchResult[] = [];
  for (let i = 0; i < titles.length; i++) {
    const title = String(titles[i] ?? "");
    const url = String(urls[i] ?? "");
    const snippet = Array.isArray(descriptions) && typeof descriptions[i] === "string"
      ? (descriptions[i] as string)
      : "";
    if (!title || !url) continue;
    results.push({ title, url, snippet });
  }
  return results;
}

// ── Provider fallback chain ───────────────────────────────────────────────────

export interface SearchProvider {
  name: string;
  /** If set, this provider is recorded as skipped with this reason and not attempted. */
  skipReason?: string;
  /** Pre-computed search URL for this query — used in the expanded result view. */
  searchUrl?: string;
  rateLimiter: RateLimiter;
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

/**
 * Tries each provider in order, skipping those blocked by their rate limiter
 * or that throw. Returns results from the first successful provider.
 * Throws if every provider is skipped or fails.
 */
export async function searchWithProviders(
  query: string,
  maxResults: number,
  providers: SearchProvider[],
): Promise<{ results: SearchResult[]; provider: string; searchUrl: string; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];
  let lastEmptyProvider: string | null = null;
  let lastEmptySearchUrl = "";

  for (const provider of providers) {
    if (provider.skipReason) {
      attempts.push({ name: provider.name, outcome: "skipped", skipReason: provider.skipReason });
      continue;
    }
    if (!provider.rateLimiter.tryAcquire()) {
      attempts.push({ name: provider.name, outcome: "rate_limited" });
      continue;
    }
    try {
      const results = await provider.search(query, maxResults);
      if (results.length > 0) {
        attempts.push({ name: provider.name, outcome: "success", resultCount: results.length });
        return {
          results: results.slice(0, maxResults),
          provider: provider.name,
          searchUrl: provider.searchUrl ?? "",
          attempts,
        };
      }
      // Provider responded but returned nothing — remember it and try the next.
      attempts.push({ name: provider.name, outcome: "empty", resultCount: 0 });
      lastEmptyProvider = provider.name;
      lastEmptySearchUrl = provider.searchUrl ?? "";
    } catch {
      // Provider threw — fall through to next provider.
      attempts.push({ name: provider.name, outcome: "error" });
    }
  }

  if (lastEmptyProvider !== null) {
    return { results: [], provider: lastEmptyProvider, searchUrl: lastEmptySearchUrl, attempts };
  }
  throw new Error(`All search providers exhausted for query: "${query}"`);
}

// ── Real provider implementations ─────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string;
}

async function fetchForSearch(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": randomUserAgent() },
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text };
}

async function ddgSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const { ok, status, body } = await fetchForSearch(url);
  if (!ok) throw new Error(`DuckDuckGo search returned non-2xx: ${status}`);
  // 202 is DDG's bot-detection/CAPTCHA interstitial — treat as failure so we fall back.
  if (status === 202) throw new Error("DuckDuckGo returned bot-detection page (202)");
  return parseDuckDuckGoHtml(body).slice(0, maxResults);
}

async function bingSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=en-US&setlang=en`;
  const { ok, status, body } = await fetchForSearch(url);
  if (!ok) throw new Error(`Bing search returned non-2xx: ${status}`);
  return parseBingHtml(body).slice(0, maxResults);
}

async function searxngSearch(query: string, maxResults: number, baseUrl: string): Promise<SearchResult[]> {
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;
  const { ok, body } = await fetchForSearch(url);
  if (!ok) throw new Error("SearXNG search returned non-2xx");
  return parseSearXNGJson(JSON.parse(body) as unknown).slice(0, maxResults);
}

async function wikipediaSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${maxResults}&namespace=0&format=json`;
  const { ok, body } = await fetchForSearch(url);
  if (!ok) throw new Error("Wikipedia search returned non-2xx");
  return parseWikipediaOpenSearch(JSON.parse(body) as unknown);
}

// Module-level rate limiters — one token bucket per provider
const DDG_RATE_LIMITER = new RateLimiter(10, 60_000);
const BING_RATE_LIMITER = new RateLimiter(10, 60_000);
const SEARXNG_RATE_LIMITER = new RateLimiter(10, 60_000);
const WIKIPEDIA_RATE_LIMITER = new RateLimiter(20, 60_000);

/**
 * Searches via the provider chain: DuckDuckGo HTML → Bing → SearXNG (optional) → Wikipedia OpenSearch.
 * `options.searxngUrl` activates the SearXNG provider when set; otherwise SearXNG is recorded as skipped.
 */
export async function search(
  query: string,
  maxResults: number,
  options?: { searxngUrl?: string },
): Promise<{ results: SearchResult[]; provider: string; searchUrl: string; attempts: ProviderAttempt[] }> {
  const encodedQuery = encodeURIComponent(query);
  const searxngProvider: SearchProvider = options?.searxngUrl
    ? {
        name: "searxng",
        rateLimiter: SEARXNG_RATE_LIMITER,
        searchUrl: `${options.searxngUrl}/search?q=${encodedQuery}&format=json&categories=general`,
        search: (q: string, n: number) => searxngSearch(q, n, options.searxngUrl!),
      }
    : {
        name: "searxng",
        rateLimiter: SEARXNG_RATE_LIMITER,
        skipReason: "not configured",
        search: async () => [],
      };

  const providers: SearchProvider[] = [
    {
      name: "duckduckgo-html",
      rateLimiter: DDG_RATE_LIMITER,
      searchUrl: `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
      search: (q, n) => ddgSearch(q, n),
    },
    {
      name: "bing",
      rateLimiter: BING_RATE_LIMITER,
      searchUrl: `https://www.bing.com/search?q=${encodedQuery}&mkt=en-US&setlang=en`,
      search: (q, n) => bingSearch(q, n),
    },
    searxngProvider,
    {
      name: "wikipedia",
      rateLimiter: WIKIPEDIA_RATE_LIMITER,
      searchUrl: `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodedQuery}&limit=${maxResults}&namespace=0&format=json`,
      search: (q, n) => wikipediaSearch(q, n),
    },
  ];
  return searchWithProviders(query, maxResults, providers);
}
