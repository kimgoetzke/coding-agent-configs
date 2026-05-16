# Pi web-tools extension

Registers two LLM-callable tools — `web_search` and `fetch_content` — that give Pi structured, token-efficient web access without requiring any API key. With only the default tools, the agent will have to use `curl` or similar which will use significantly more tokens and fill up the context window much faster.

## Installation

Copy this folder into your Pi config:

```bash
mkdir -p ~/.pi/agent/extensions
cp -R .pi/agent/extensions/web-tools ~/.pi/agent/extensions/web-tools
```

Install dependencies:

```bash
cd ~/.pi/agent/extensions/web-tools
nix shell nixpkgs#nodejs --command npm install
```

Install the bundled Chromium browser (one-time, ~180 MB):

```bash
npx playwright install chromium

# If you use Nix, via a shell:
nix shell nixpkgs#nodejs --command npx playwright install chromium
```

**NixOS:** After installing, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the nixpkgs-wrapped Chromium binary so the dynamic linker can find its shared libraries:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(nix shell nixpkgs#chromium --command which chromium)
```

Add this to your shell profile or Pi's launch environment. Without it, the bundled headless-shell binary will fail to start on NixOS.

Then reload Pi:

```text
/reload
```

## Optional config file

Create `~/.pi/agent/web-tools.json` to override defaults. Missing file or missing keys fall back silently. An invalid file logs a warning and falls back to defaults.

```json
{
  "searxngUrl": "https://your-searxng-instance.example.com", // Empty by default
  "defaultMaxTokens": 8000, // Default
  "providers": ["duckduckgo", "bing", "searxng", "wikipedia"], // Default
  "cheapModels": [
    "github-copilot/gpt-5-mini",
    "anthropic/claude-haiku-4-5-20251001",
    "github-copilot/claude-haiku-4.5",
    "github-copilot/gpt-5.4-mini",
    "google/gemini-2.5-flash-lite",
    "openai/gpt-4.1-nano",
    "openai/gpt-4o-mini",
    "openai/gpt-5-mini",
    "deepseek/deepseek-chat"
  ] // Default
}
```

| Field              | Type     | Description                                                                                                                      |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `searxngUrl`       | string   | Base URL of a SearXNG instance; enables the SearXNG provider                                                                     |
| `defaultMaxTokens` | number   | Default token budget for `fetch_content` (overridable per call)                                                                  |
| `providers`        | string[] | Provider order override; valid values listed above                                                                               |
| `cheapModels`      | string[] | Models to use for content summarisation, format `"provider/model-id"`. Set to `[]` to disable. Omit to use the auto-detect list. |

## Tools

### `web_search`

Searches the web and returns structured results.

| Parameter    | Type   | Required | Default | Description                                |
| ------------ | ------ | -------- | ------- | ------------------------------------------ |
| `query`      | string | yes      | —       | Natural language search query              |
| `maxResults` | number | no       | 10      | Maximum results to return (hard cap at 20) |

Returns an ordered list of `{ title, url, snippet }` objects. Every URL in the results is automatically added to the URL allow-list so `fetch_content` can retrieve them.

Provider chain (tried in order, first with results wins):

1. **DuckDuckGo HTML** — primary, no key required, scraped from `html.duckduckgo.com`
2. **Bing** — secondary fallback, no key required, HTML scrape with click-URL decoding
3. **SearXNG** — optional; only consulted if `searxngUrl` is set in config
4. **Wikipedia OpenSearch** — last resort, narrow domain, official API

### `fetch_content`

Fetches a URL and returns clean, token-efficient content.

| Parameter   | Type   | Required | Default                | Description                                                                                              |
| ----------- | ------ | -------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `url`       | string | yes      | —                      | URL to fetch; must be on the allow-list (see below)                                                      |
| `maxTokens` | number | no       | 8,000                  | Token budget for the returned content (max 16,000)                                                       |
| `query`     | string | no       | current session prompt | Relevance filter — only paragraphs matching this query are returned; omit to use the auto-derived prompt |

**HTML pages** are processed via Mozilla Readability to strip nav/ads/boilerplate, then converted to markdown (headings, paragraphs, code blocks, links preserved).

**GitHub URLs** are routed to repository content instead of HTML scraping:

| URL shape                                     | What is returned                  |
| --------------------------------------------- | --------------------------------- |
| `github.com/<owner>/<repo>`                   | Full recursive file tree + README |
| `github.com/<owner>/<repo>/tree/<ref>/<path>` | Directory listing under `<path>`  |
| `github.com/<owner>/<repo>/blob/<ref>/<path>` | Raw file contents                 |

Root repos ≤ 350 MB are fetched via `git clone --depth 1`; larger repos use the GitHub API tree endpoint (`?recursive=1`). Private repos require `gh auth login` — a clear error is returned if the CLI is unavailable or unauthenticated.

**Prompt-filtered fetch:** after HTML extraction, content is filtered to paragraphs relevant to the active query before the token budget is applied. The query defaults to the user's most recent prompt; override it per call via the `query` parameter. If the query is empty or consists entirely of stopwords, the full content is returned unfiltered.

The expanded result view (Ctrl+O) shows `via: html | text | github-api | github-clone | browser-html` to indicate which extraction path was taken. When a browser fetch was attempted but fell back to static extraction, the label shows `via: html (browser attempted, fell back)`.

**Automatic JavaScript rendering:** after static HTML extraction, if the result is thin (< 500 characters of markdown) and the raw HTML contains more than 3 `<script>` tags, `fetch_content` automatically re-fetches the page using a headless Chromium browser. The browser waits for the network to go idle (up to 15 seconds) before extracting the rendered HTML. If the browser fetch fails for any reason, the static result is returned instead. No extra parameter is needed — detection is fully automatic.

Token count is approximated as `chars / 4`. Non-HTML responses (plain text, JSON, markdown) are returned verbatim without filtering. Up to 3 fetches run concurrently; each request times out after 30 seconds.

#### URL allow-list

`fetch_content` enforces a session-scoped URL allow-list to prevent prompt-injection attacks where a malicious page instructs the agent to exfiltrate data via crafted URLs.

A URL is allowed when any of the following is true:

- It was returned by a prior `web_search` call in the current session
- It appeared verbatim in the user's most recent message

The allow-list is cleared at the start of each fresh Pi session (`startup`, `new`, `resume`, `fork`).

**Limit:** the allow-list only enforces exact URL matching (with normalisation for trailing slashes, default ports, and fragments). It does not prevent the agent from fetching a previously allowed URL that now serves attacker-controlled content — redirect chains and link-following are not tracked.

#### Token budget

The default budget is **8,000 tokens (~32,000 characters)** per page. Truncation occurs at the nearest paragraph boundary; a tail marker is appended: `…[truncated: N more tokens approx]`. Override per call via the `maxTokens` parameter (agent-configurable up to 16,000).

Token counting uses a `chars / 4` approximation to avoid pulling a tokeniser dependency. Actual token counts may differ by ±20%.

#### Content summarisation

When `fetch_content` is called, web-tools will attempt to summarise the extracted page content using a cheap/fast model before returning it to the main agent. This reduces token usage and focuses the result on the active query.

**Auto-detection:** on first use per session, the extension probes a priority list of cheap models (GitHub Copilot GPT-5 Mini → Anthropic Haiku → GitHub Copilot Haiku → GitHub Copilot GPT-5.4 Mini → Google Gemini Flash Lite → OpenAI GPT-4.1 Nano → OpenAI GPT-4o-mini → OpenAI GPT-5 Mini → DeepSeek Chat). The first one with valid auth configured in Pi is used for the rest of the session.

**Returned format:** when summarised, the content begins with a header so the main agent can attribute correctly:

```
[Content summarised by anthropic/claude-haiku-4-5-20251001 — this is a summary, not verbatim page text]

{summary text}
```

**Graceful fallback:** if no cheap model has valid auth, or the model call fails, the raw extracted content is returned as normal.

**Opt-out:** set `"cheapModels": []` in `web-tools.json` to disable summarisation entirely.

**User override:** set `"cheapModels"` to a specific list (format `"provider/model-id"`) to control which models are tried and in what order.

## Known limitations

- **Chromium binary (~180 MB):** the bundled Chromium is downloaded once via `npx playwright install chromium`. It is managed by Playwright outside `node_modules` and is not included in the extension itself.
- **No PDF extraction:** PDFs return binary or text content without specialised parsing.
- **No video:** YouTube and other video URLs are not handled.
- **GitHub clone requires `git`:** root repo fetches below the 350 MB threshold run `git clone --depth 1`, which requires `git` on `$PATH`. Repos above the threshold use the GitHub API instead.
- **GitHub API rate limits:** unauthenticated requests are capped at 60/hr. Authenticate with `gh auth login` to raise the limit and enable private repo access.
- **DuckDuckGo rate limiting:** DuckDuckGo's HTML endpoint occasionally returns a bot-detection interstitial (HTTP 202) with no results; Bing is the automatic fallback.
- **Token approximation:** the `chars / 4` token estimate may deviate ±20% from actual tokeniser output.

## Testing

Run from this directory:

```bash
nix shell nixpkgs#nodejs --command node --experimental-strip-types --test *.test.ts
```

Browser integration tests (`browser-fetcher.test.ts`) require Chromium. On NixOS, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` first (see installation instructions above).
