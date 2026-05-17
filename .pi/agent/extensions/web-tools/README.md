# Pi web-tools extension

Registers two LLM-callable tools — `web_search` and `fetch_content` — that give Pi structured, token-efficient web access without requiring any API key. With only the default tools, the agent will have to use `curl` or similar which will use significantly more tokens and fill up the context window much faster.

## Installation

**Step 1:** Copy this folder into your Pi config:

```bash
cp -R .pi/agent/extensions/web-tools ~/.pi/agent/extensions/web-tools
```

**Step 2:** Install dependencies:

```bash
cd ~/.pi/agent/extensions/web-tools
npm install

# If you use Nix, via a shell:
nix shell nixpkgs#nodejs --command npm install
```

**Step 3:** (Recommended) Install the bundled Chromium browser (one-time, ~180 MB):

```bash
npx playwright install chromium

# If you use Nix, via a shell:
nix shell nixpkgs#nodejs --command npx playwright install chromium
```

Without this, you will not be able to fetch content from websites that require JS to render content.

**Only on NixOS:** After installing, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the nixpkgs-wrapped Chromium binary so the dynamic linker can find its shared libraries:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(nix shell nixpkgs#chromium --command which chromium)
```

Add `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to your shell profile or Pi's launch environment. Without it, the bundled headless-shell binary will fail to start on NixOS.

**Step 4:** Reload Pi with `/reload`

## Optional config file

Create `~/.pi/agent/web-tools.json` to override defaults. Missing file or missing keys fall back silently. An invalid file logs a warning and falls back to defaults.

```json
{
  "searxngUrl": "https://your-searxng-instance.example.com", // Empty by default
  "defaultMaxTokens": 8000, // Default
  "providers": ["duckduckgo", "bing", "searxng", "wikipedia"], // Default
  "jsRendering": true, // Default
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
  ], // Default
  "forceVerbatimContentFetch": [
    { "host": "internal.example.com" },
    { "subdomain": "docs" },
    { "pathPrefix": "/handbook/" }
  ] // Optional: extends auto verbatim detection
}
```

| Field                       | Type     | Description                                                                                                                                  |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `searxngUrl`                | string   | Base URL of a SearXNG instance; enables the SearXNG provider                                                                                 |
| `defaultMaxTokens`          | number   | Default token budget for `fetch_content` (overridable per call)                                                                              |
| `providers`                 | string[] | Provider order override; valid values listed above                                                                                           |
| `jsRendering`               | boolean  | Enable headless Chromium JS rendering (default `true`). Set to `false` to disable — no Chromium required, static fetch only.                 |
| `cheapModels`               | string[] | Models to use for content summarisation, format `"provider/model-id"`. Set to `[]` to disable. Omit to use the auto-detect list.             |
| `forceVerbatimContentFetch` | object[] | Extra auto-mode rules that force verbatim output. Each rule may set `host`, `subdomain`, and/or `pathPrefix`; all defined fields must match. |

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
| `maxTokens` | number | no       | mode-dependent         | Token budget for the returned content (cap 16,000)                                                       |
| `query`     | string | no       | current session prompt | Relevance filter — only paragraphs matching this query are returned; omit to use the auto-derived prompt |
| `mode`      | string | no       | `auto`                 | Fidelity mode: `auto`, `verbatim`, or `summary`                                                          |

#### Features

**HTML pages** are processed via Mozilla Readability to strip nav/ads/boilerplate, then converted to markdown (headings, paragraphs, code blocks, links preserved).

**GitHub URLs** are routed to repository content instead of HTML scraping:

| URL shape                                     | What is returned                  |
| --------------------------------------------- | --------------------------------- |
| `github.com/<owner>/<repo>`                   | Full recursive file tree + README |
| `github.com/<owner>/<repo>/tree/<ref>/<path>` | Directory listing under `<path>`  |
| `github.com/<owner>/<repo>/blob/<ref>/<path>` | Raw file contents                 |

Root repos ≤ 350 MB are fetched via `git clone --depth 1`; larger repos use the GitHub API tree endpoint (`?recursive=1`). Private repos require `gh auth login` — a clear error is returned if the CLI is unavailable or unauthenticated.

**Prompt-filtered fetch:** after HTML extraction, content is filtered to paragraphs relevant to the active query before the token budget is applied only when `mode: "summary"` falls back to verbatim because no cheap model is available. The query defaults to the user's most recent prompt; override it per call via the `query` parameter. If the query is empty or consists entirely of stopwords, the full content is returned unfiltered.

**Automatic JavaScript rendering:** after static HTML extraction, if the result is thin (< 500 characters of markdown) and the raw HTML contains more than 3 `<script>` tags, `fetch_content` automatically re-fetches the page using a headless Chromium browser. The browser waits for the network to go idle (up to 15 seconds) before extracting the rendered HTML. If the browser fetch fails for any reason, the static result is returned instead. No extra parameter is needed — detection is fully automatic.

**Detailed expanded result view:** Among many other things, the expanded result view (Ctrl+O) shows `via: html | text | github-api | github-clone | browser-html` to indicate which extraction path was taken. When a browser fetch was attempted but fell back to static extraction, the label shows `via: html (browser attempted, fell back)`.

**Miscellaneous:** Token count is approximated as `chars / 4`. Non-HTML responses (plain text, JSON, markdown) are returned verbatim without filtering. Up to 3 fetches run concurrently; each request times out after 30 seconds.

##### Fidelity modes

- `mode: "verbatim"` — always return extracted content verbatim; bypasses cheap-model summarisation and prompt filtering.
- `mode: "summary"` — prefer cheap-model summarisation; if no cheap model is available or summarisation fails, fall back to extracted content.
- `mode: "auto"` — default. Returns verbatim content for conservative docs/reference/code URL matches, otherwise prefers summary mode.

Built-in `auto` verbatim matches:

- **Hosts:** `pi.dev`, `github.com`, `raw.githubusercontent.com`, `gist.github.com`, `gitlab.com`, `bitbucket.org`, `codeberg.org`, `sr.ht`, `sourceforge.net`, `dev.azure.com`
- **Subdomains:** `docs`, `api`, `reference`, `developer`, `developers`, `learn`
- **Path prefixes:** `/docs/`, `/reference/`, `/api/`, `/sdk/`, `/manual/`, `/raw/`

Use `forceVerbatimContentFetch` in config to add more `host`, `subdomain`, or `pathPrefix` rules.

##### URL allow-list

`fetch_content` enforces a session-scoped URL allow-list to prevent prompt-injection attacks where a malicious page instructs the agent to exfiltrate data via crafted URLs.

A URL is allowed when any of the following is true:

- It was returned by a prior `web_search` call in the current session
- It appeared verbatim in the user's most recent message

The allow-list is cleared at the start of each fresh Pi session (`startup`, `new`, `resume`, `fork`).

**Limit:** the allow-list only enforces exact URL matching (with normalisation for trailing slashes, default ports, and fragments). It does not prevent the agent from fetching a previously allowed URL that now serves attacker-controlled content — redirect chains and link-following are not tracked.

##### Token budget

When `maxTokens` is omitted, summary-mode fetches use `defaultMaxTokens` from config (default **8,000 tokens / ~32,000 characters**). Verbatim fetches use **2×** that default, capped at **16,000 tokens**. Truncation occurs at the nearest paragraph boundary; a tail marker is appended: `…[truncated: N more tokens approx]`. Override per call via the `maxTokens` parameter (hard cap 16,000).

Token counting uses a `chars / 4` approximation to avoid pulling a tokeniser dependency. Actual token counts may differ by ±20%.

##### Content summarisation

When `fetch_content` is in `mode: "summary"`, or `mode: "auto"` without a verbatim URL-rule match, web-tools will attempt to summarise the extracted page content using a cheap/fast model before returning it to the main agent. This reduces token usage and focuses the result on the active query.

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

- **Chromium binary:** to enable optional JavaScript rendering, the bundled Chromium is downloaded once via `npx playwright install chromium`. It is managed by Playwright outside `node_modules` and is not included in the extension itself.
- **No PDF extraction:** PDFs return binary or text content without specialised parsing.
- **No video:** YouTube and other video URLs are not handled.
- **GitHub clone requires `git`:** root repo fetches below the 350 MB threshold run `git clone --depth 1`, which requires `git` on `$PATH`. Repos above the threshold use the GitHub API instead.
- **GitHub API rate limits:** unauthenticated requests are capped at 60/hr. Authenticate with `gh auth login` to raise the limit and enable private repo access.
- **DuckDuckGo rate limiting:** DuckDuckGo's HTML endpoint occasionally returns a bot-detection interstitial (HTTP 202) with no results; Bing is the automatic fallback.
- **Token approximation:** the `chars / 4` token estimate may deviate ±20% from actual tokeniser output.

## Testing

Run from the root directory with `node` on the PATH:

```bash
node --test .pi/agent/extensions/conversation-statusline/*.test.js
```

Run from extension directory in Nix:

```bash
nix shell nixpkgs#nodejs -c node --experimental-strip-types --test *.test.ts
```

Browser integration tests (`browser-fetcher.test.ts`) require Chromium. On NixOS, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` first (see installation instructions above).
