# Pi web-search extension

Registers two LLM-callable tools — `web_search` and `fetch_content` — that give Pi structured, token-efficient web access without requiring any API key.

## Tools

### `web_search`

Searches the web and returns structured results.

| Parameter    | Type   | Required | Default | Description                                   |
| ------------ | ------ | -------- | ------- | --------------------------------------------- |
| `query`      | string | yes      | —       | Natural language search query                 |
| `maxResults` | number | no       | 10      | Maximum results to return (hard cap at 20)    |

Returns an ordered list of `{ title, url, snippet }` objects. Every URL in the results is automatically added to the URL allow-list so `fetch_content` can retrieve them.

Provider chain (tried in order, first with results wins):

1. **DuckDuckGo HTML** — primary, no key required, scraped from `html.duckduckgo.com`
2. **Bing** — secondary fallback, no key required, HTML scrape with click-URL decoding
3. **SearXNG** — optional; only consulted if `searxngUrl` is set in config
4. **Wikipedia OpenSearch** — last resort, narrow domain, official API

### `fetch_content`

Fetches a URL and returns clean, token-efficient prose extracted via Mozilla Readability.

| Parameter   | Type   | Required | Default      | Description                                                  |
| ----------- | ------ | -------- | ------------ | ------------------------------------------------------------ |
| `url`       | string | yes      | —            | URL to fetch; must be on the allow-list (see below)          |
| `maxTokens` | number | no       | 8,000        | Token budget for the returned content (max 16,000)           |

Returns the article body in markdown (headings, paragraphs, code blocks preserved). Token count is approximated as `chars / 4`. Non-HTML responses (plain text, JSON, markdown) are returned verbatim. Up to 3 fetches run concurrently; each request times out after 30 seconds.

## URL allow-list

`fetch_content` enforces a session-scoped URL allow-list to prevent prompt-injection attacks where a malicious page instructs the agent to exfiltrate data via crafted URLs.

A URL is allowed when any of the following is true:

- It was returned by a prior `web_search` call in the current session
- It appeared verbatim in the user's most recent message

The allow-list is cleared at the start of each fresh Pi session (`startup`, `new`, `resume`, `fork`).

**Limit:** the allow-list only enforces exact URL matching (with normalisation for trailing slashes, default ports, and fragments). It does not prevent the agent from fetching a previously allowed URL that now serves attacker-controlled content — redirect chains and link-following are not tracked.

## Token budget

The default budget is **8,000 tokens (~32,000 characters)** per page. Truncation occurs at the nearest paragraph boundary; a tail marker is appended: `…[truncated: N more tokens approx]`. Override per call via the `maxTokens` parameter (agent-configurable up to 16,000).

Token counting uses a `chars / 4` approximation to avoid pulling a tokeniser dependency. Actual token counts may differ by ±20%.

## Optional config file

Create `~/.pi/agent/web-search.json` to override defaults. Missing file or missing keys fall back silently. An invalid file logs a warning and falls back to defaults.

```json
{
  "searxngUrl": "https://your-searxng-instance.example.com",
  "defaultMaxTokens": 8000,
  "providers": ["duckduckgo", "bing", "searxng", "wikipedia"]
}
```

| Field              | Type     | Description                                                      |
| ------------------ | -------- | ---------------------------------------------------------------- |
| `searxngUrl`       | string   | Base URL of a SearXNG instance; enables the SearXNG provider    |
| `defaultMaxTokens` | number   | Default token budget for `fetch_content` (overridable per call) |
| `providers`        | string[] | Provider order override; valid values listed above               |

## Known limitations

- **No JavaScript rendering:** static HTTP fetch only. Pages that rely on JavaScript execution to populate content (SPAs, React/Next.js apps) may return empty or partial content.
- **No PDF extraction:** PDFs return binary or text content without specialised parsing.
- **No video:** YouTube and other video URLs are not handled.
- **No GitHub clone:** GitHub URLs are scraped as HTML, not cloned. Raw file contents are not returned.
- **DuckDuckGo rate limiting:** DuckDuckGo's HTML endpoint occasionally returns a bot-detection interstitial (HTTP 202) with no results; Bing is the automatic fallback.
- **Token approximation:** the `chars / 4` token estimate may deviate ±20% from actual tokeniser output.

## Installation

Copy this folder into your Pi config:

```bash
mkdir -p ~/.pi/agent/extensions
cp -R .pi/agent/extensions/web-search ~/.pi/agent/extensions/web-search
```

Install dependencies:

```bash
cd ~/.pi/agent/extensions/web-search
nix shell nixpkgs#nodejs --command npm install
```

Then reload Pi:

```text
/reload
```

## Testing

Run from this directory:

```bash
nix shell nixpkgs#nodejs --command node --experimental-strip-types --test *.test.ts
```
