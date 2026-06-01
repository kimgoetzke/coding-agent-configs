# Web-tools search provider chain — improvement options

**Date:** 2026-05-17  
**Scope:** `.pi/agent/extensions/web-tools/` — `search-providers.ts`, `config.ts`, `web-tools.ts`

---

## Current chain

The `search()` function in `search-providers.ts:316` assembles providers in this order and tries them sequentially via `searchWithProviders()`:

| # | Name | Method | Rate limit | Skip condition |
|---|------|--------|------------|----------------|
| 1 | `duckduckgo-html` | GET `html.duckduckgo.com/html/?q=…` — HTML scrape | 10/60s | none |
| 2 | `bing` | GET `bing.com/search?q=…` — HTML scrape | 10/60s | none |
| 3 | `searxng` | GET `{baseUrl}/search?format=json` — JSON API | 10/60s | **skipped** if `searxngUrl` not set in config |
| 4 | `wikipedia` | GET Wikipedia OpenSearch API | 20/60s | none |

The `Provider` type in `config.ts:10` is `"duckduckgo" | "bing" | "searxng" | "wikipedia"` — the user can reorder/restrict providers via `providers` in `~/.pi/agent/web-tools.json`.

The `fetchForSearch()` function at `search-providers.ts:266` uses basic user-agent rotation from a three-entry pool. No TLS fingerprint spoofing.

---

## Known reliability issues

### DuckDuckGo (`html.duckduckgo.com/html/`)
- **202 bot-detection** is a documented, recurring production issue (open-webui, crewAI community threads). The code already handles it (`search-providers.ts:281`): a 202 throws, which causes fallback to Bing.
- Works well at low rates (<10 req/min) from residential IPs. Datacenter IPs get blocked more readily.
- **Verdict: keep at position 1.** The 202 handling is correct; fallback is fast.

### Bing (`bing.com/search`)
- Microsoft retired the official Bing Search API in August 2025 — HTML scraping is the only free route.
- Bing runs a WAF that fingerprints TLS JA3. Standard Node.js `fetch()` (used by the extension) presents a predictable TLS fingerprint; scrapers using Python's `requests` library are well-documented as frequently blocked. The extension's `fetchForSearch` uses the WHATWG `fetch` API, so TLS fingerprinting applies.
- Without TLS impersonation (e.g., `curl_cffi` in Python, or a browser-like TLS stack), Bing blocks are more frequent than DDG at moderate volumes.
- `Sec-Fetch-*` headers are not sent by the current implementation — Bing checks these.
- **Verdict: keep at position 2, but Bing reliability is lower than it appears.** Could add `Accept`, `Accept-Language`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site` headers to `fetchForSearch` to reduce blocks. That's a low-effort improvement.

---

## Free search provider landscape (researched 2026-05-17)

### Viable no-key additions

#### You.com free endpoint
- **URL:** `https://you.com/search?q={query}&fromSearchBar=true` (HTML) or the undocumented `/v1/agents/search?profile=free` JSON endpoint.
- **Key required:** No. 100 requests/day on the keyless endpoint; more with a free API account (no credit card, one-time $100 credit).
- **Bot detection:** N/A — official API endpoint.
- **Result quality:** Good general web results. Not Bing/Google tier but solid.
- **Verdict: best candidate for an unconditional new provider.** The 100 req/day limit fits a coding agent's usage pattern well (agents don't run thousands of searches per day). Place between SearXNG and Wikipedia.

#### Marginalia Search public API
- **URL:** `https://api2.marginalia-search.com/public/search/{query}` (JSON, no key, `public` literal as the key segment).
- **Key required:** No. Shared rate limit; 503 on exhaustion.
- **Bot detection:** None — official API.
- **Result quality:** Niche. Intentionally de-ranks commercial/SEO content. Excellent for developer/technical queries; produces zero results for many mainstream topics.
- **Verdict: good late-stage fallback.** Place after You.com, before Wikipedia. Useful for the technical queries a coding agent commonly makes.

#### Stract public API
- **URL:** `https://stract.com/beta/api/search` (JSON, no key). See Swagger at `stract.com/beta/api/docs/`.
- **Key required:** No registration.
- **Bot detection:** None — official API.
- **Result quality:** Small independent index, developer-oriented, low commercial spam. Similar positioning to Marginalia.
- **Verdict: viable late-stage fallback**, similar to Marginalia. Adding both would give the chain two independent small-web engines before the Wikipedia last resort.

### Optional user-configured additions (key required)

#### Brave Search API
- **Key required:** Yes. New signups no longer get a free tier; instead ~$5/month credit (~1,000 queries). Legacy accounts keep free quota.
- **Result quality:** High. Brave maintains an independent index, not a Bing/Google reseller.
- **Verdict: fits the "optional" slot alongside SearXNG.** Would require adding `braveApiKey` to `WebSearchConfig` and a corresponding provider. High-quality results justify it for users willing to pay.

### Not worth adding

| Provider | Reason |
|----------|--------|
| Yahoo | Uses Bing's index; far more aggressive CAPTCHA than Bing; no gain |
| Yandex | SmartCaptcha deployed at scale; frequent IP bans; poor English results |
| Startpage | Google reseller; same bot-blocking incentives as Google itself |
| Kagi | Invite-only API, $25/1,000 queries |
| Mojeek | No unconditional free tier |
| Common Crawl | Archival corpus, not a search engine |

---

## Recommended updated chain

```
1. duckduckgo-html     (unchanged — keep at position 1)
2. bing                (unchanged — potential header improvement)
3. searxng             (unchanged — optional, user-configured)
4. you-com             (NEW — free, no key, 100 req/day, good general results)
5. marginalia          (NEW — free, no key, public API, strong for technical queries)
6. stract              (NEW — free, no key, independent index)
7. wikipedia           (unchanged — last resort, narrow domain)
```

Brave Search would be an additional optional provider like SearXNG (key required).

---

## Code change summary

### 1. Add `fetchForSearch` headers (low effort, improves Bing reliability)

In `search-providers.ts:267`, extend the `fetch()` call headers:

```ts
headers: {
  "User-Agent": randomUserAgent(),
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
},
```

### 2. Add You.com provider

New function `youComSearch()` hitting the JSON endpoint. Add `YOU_COM_RATE_LIMITER = new RateLimiter(3, 60_000)` (conservative — 100 req/day = ~4/hour, so 3/min is fine).

Add a `parseYouComJson()` parser for the response shape.

### 3. Add Marginalia provider

New function `marginaliaSearch()` hitting `api2.marginalia-search.com/public/search/{query}`. Parse the JSON response (shape: `{ results: [{ url, title, description }] }`).

Rate limit: `MARGINALIA_RATE_LIMITER = new RateLimiter(5, 60_000)`.

### 4. Add Stract provider (optional)

New function `stractSearch()` hitting `stract.com/beta/api/search`. Parse JSON response. Rate limit similar to Marginalia.

### 5. Update `config.ts` Provider type

```ts
export type Provider = "duckduckgo" | "bing" | "searxng" | "you-com" | "marginalia" | "stract" | "wikipedia";
```

Update `VALID_PROVIDERS` set accordingly.

### 6. Update tool description in `web-tools.ts:203`

The description string currently says "Tries DuckDuckGo HTML first, then Bing, then Wikipedia" — update to reflect the new chain.

---

## Open questions

- Is the You.com `/v1/agents/search?profile=free` endpoint stable? It may be an undocumented path. The public HTML scrape of `you.com/search` is an alternative but harder to parse.
- Does the Stract API have usage-specific response shapes that need empirical testing?
- Should new providers be on by default, or should they be opt-in via `providers` config? Given the existing config mechanism, defaulting them on and letting the user exclude them via `providers` is consistent with the current design.
