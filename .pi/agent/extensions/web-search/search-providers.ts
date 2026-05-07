export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
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
): Promise<{ results: SearchResult[]; provider: string }> {
  for (const provider of providers) {
    if (!provider.rateLimiter.tryAcquire()) continue;
    try {
      const results = await provider.search(query, maxResults);
      return { results: results.slice(0, maxResults), provider: provider.name };
    } catch {
      // fall through to next provider
    }
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

async function fetchForSearch(url: string): Promise<{ ok: boolean; body: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": randomUserAgent() },
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
  });
  const text = await response.text();
  return { ok: response.ok, body: text };
}

async function ddgSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const { ok, body } = await fetchForSearch(url);
  if (!ok) throw new Error("DuckDuckGo search returned non-2xx");
  return parseDuckDuckGoHtml(body).slice(0, maxResults);
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
const SEARXNG_RATE_LIMITER = new RateLimiter(10, 60_000);
const WIKIPEDIA_RATE_LIMITER = new RateLimiter(20, 60_000);

/**
 * Searches via the provider chain: DuckDuckGo HTML → SearXNG (optional) → Wikipedia OpenSearch.
 * `options.searxngUrl` activates the SearXNG provider when set.
 */
export async function search(
  query: string,
  maxResults: number,
  options?: { searxngUrl?: string },
): Promise<{ results: SearchResult[]; provider: string }> {
  const providers: SearchProvider[] = [
    {
      name: "duckduckgo-html",
      rateLimiter: DDG_RATE_LIMITER,
      search: (q, n) => ddgSearch(q, n),
    },
    ...(options?.searxngUrl
      ? [{
          name: "searxng",
          rateLimiter: SEARXNG_RATE_LIMITER,
          search: (q: string, n: number) => searxngSearch(q, n, options.searxngUrl!),
        }]
      : []),
    {
      name: "wikipedia",
      rateLimiter: WIKIPEDIA_RATE_LIMITER,
      search: (q, n) => wikipediaSearch(q, n),
    },
  ];
  return searchWithProviders(query, maxResults, providers);
}
