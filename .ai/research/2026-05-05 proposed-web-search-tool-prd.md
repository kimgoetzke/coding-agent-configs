Product Requirements Document

**Web Search & Fetch Tooling**

For Agentic Coding Agents

**Status:** Draft **Version:** 1.0 **Date:** May 2026

# **1\. Purpose & Scope**

This document defines the requirements for web search and content fetch tooling in agentic coding agents. It captures the functional gaps of raw HTTP access (curl/bash), the capabilities that a purpose-built web tool must provide, and the security constraints that govern safe operation in an autonomous agent context.

The requirements are derived from analysis of existing implementations including Claude Code, the Pi coding agent ecosystem, and third-party Pi extensions (pi-web-access, greedysearch-pi, Parallel Search MCP, pi-web-browse).

# **2\. Problem Statement**

Raw HTTP access via curl or bash is insufficient for agentic web interaction for the following reasons:

### **2.1 Token Waste**

A raw HTTP GET returns the entire page source including navigation, scripts, stylesheets, cookie banners, and advertising markup. A typical webpage is 80–95% noise. A 500-word article may be embedded inside 50,000 tokens of HTML, consuming context window budget that should be reserved for reasoning and task execution.

### **2.2 No JavaScript Execution**

curl fetches only the initial server-rendered HTML. Modern web applications (SPAs, React/Next.js apps, documentation sites) deliver a near-empty shell on first load and populate content via JavaScript after the browser executes. curl returns nothing useful for these pages.

### **2.3 Anti-Bot Blocking**

Sites detect the curl user-agent and respond with 403 errors, CAPTCHA challenges, or Cloudflare interstitials. Legitimate content is inaccessible without a realistic browser fingerprint.

### **2.4 No Structured Search Results**

Issuing a search query via curl against a search engine returns an unparseable HTML document. There is no reliable mechanism to extract a clean, structured list of results (title, URL, snippet, publication date) for the agent to reason over.

### **2.5 No Content-Type Specialisation**

curl handles all URLs identically regardless of content type. PDFs return binary data. GitHub URLs return rendered HTML, not actual file contents. YouTube URLs return no useful content. Each of these requires bespoke handling that raw bash cannot provide.

### **2.6 No Security Constraints**

bash imposes no restrictions on which URLs an agent may fetch. A malicious webpage can instruct the agent to construct and fetch an arbitrary URL, potentially exfiltrating context window contents or credentials. Pattern-based bash allow-lists (e.g. Bash(curl http://github.com/\*)) are fragile and easily bypassed by protocol variations, flag ordering, or redirect chains.

# **3\. Goals**

- Provide agents with clean, token-efficient web content regardless of page technology

- Deliver structured search results without requiring manual HTML parsing

- Handle the full range of web content types: HTML, PDF, GitHub repositories, video

- Enforce security constraints that prevent arbitrary URL fetch attacks

- Degrade gracefully when primary access methods fail

- Operate without requiring paid API subscriptions where possible

# **4\. Non-Goals**

- Full browser automation for form submission, login flows, or UI interaction

- OCR of scanned or image-based PDFs

- Authenticated access to private services (OAuth, session cookies) unless explicitly configured

- Replacing the agent's primary reasoning or planning capabilities

# **5\. Functional Requirements**

## **5.1 Content Extraction**

The tool must transform raw HTML into clean, readable prose before injecting it into the agent's context window.

- **REQ-CE-01** Strip all HTML markup, scripts, stylesheets, navigation, footers, cookie banners, and advertising elements.

- **REQ-CE-02** Apply a content extraction algorithm equivalent to Mozilla Readability (the engine behind Firefox Reader Mode) to isolate article or document body text.

- **REQ-CE-03** Preserve document structure: headings, paragraphs, and code blocks should be retained in a readable plain-text or markdown format.

- **REQ-CE-04** Return only the content relevant to the agent's query when a prompt-filtered fetch mode is available, rather than the full page body.

- **REQ-CE-05** Enforce a token budget on extracted content to prevent single-page fetches from consuming disproportionate context.

## **5.2 Web Search**

The tool must provide structured search result objects that the agent can reason over without parsing HTML.

- **REQ-WS-01** Accept a natural language query and return an ordered list of results, each containing: title, URL, summary snippet, and publication date where available.

- **REQ-WS-02** Support at least one no-auth, no-subscription search provider as a default path (e.g. Exa MCP, Jina, Parallel Search).

- **REQ-WS-03** Support optional upgrade to higher-quality providers via API key configuration (Exa, Perplexity, Bing).

- **REQ-WS-04** Implement client-side rate limiting to avoid provider throttling (minimum: respect 10 req/min caps where published).

- **REQ-WS-05** Return source citations alongside extracted content so the agent can attribute claims.

## **5.3 JavaScript / SPA Rendering**

The tool must support content extraction from pages that require JavaScript execution to render their primary content.

- **REQ-JS-01** Launch a headless Chromium-family browser (Chrome, Brave, Edge, or Chromium) to execute page JavaScript before content extraction.

- **REQ-JS-02** Auto-detect installed browsers in standard system paths on Linux, macOS, and Windows.

- **REQ-JS-03** Wait for page content to stabilise (network idle or explicit selector) before extracting.

- **REQ-JS-04** Reuse browser sessions across requests within a task to avoid repeated startup cost.

- **REQ-JS-05** Fall back to static HTTP fetch when a headless browser is unavailable rather than failing hard.

## **5.4 Content-Type Specialisation**

The tool must apply appropriate handling logic based on URL pattern and MIME type rather than treating all URLs identically.

### **PDFs**

- **REQ-PDF-01** Detect PDF content type by MIME header or .pdf URL suffix.

- **REQ-PDF-02** Extract text content and save to a local file (e.g. \~/Downloads/) in markdown format.

- **REQ-PDF-03** Return a summary and local file path to the agent so it can read specific sections without loading the full document into context.

- **REQ-PDF-04** Document limitation: text extraction only; scanned/image PDFs are not supported without OCR.

### **GitHub URLs**

- **REQ-GH-01** Detect github.com URLs and route to repository cloning rather than HTML scraping.

- **REQ-GH-02** For root repository URLs: clone locally and return the file tree plus README contents.

- **REQ-GH-03** For /tree/ paths: return directory listing.

- **REQ-GH-04** For /blob/ paths: return the raw file contents.

- **REQ-GH-05** Cache clones for the duration of the session; purge on session change.

- **REQ-GH-06** For repositories over a size threshold (e.g. 350 MB): fall back to GitHub API-based lightweight view.

- **REQ-GH-07** Require gh CLI or equivalent for private repository access.

### **Video (YouTube / Local)**

- **REQ-VID-01** Detect YouTube URLs and route to transcript and visual description extraction.

- **REQ-VID-02** Return: full transcript with timestamps, chapter markers, and a visual description of key frames.

- **REQ-VID-03** Support prompt-scoped queries (e.g. 'what does the presenter say about X at timestamp Y').

- **REQ-VID-04** Document limitation: private and age-restricted videos may fail across all extraction paths.

## **5.5 Fallback Chains**

The tool must not present a hard failure to the agent when a primary access method is blocked or unavailable. Every capability must have an ordered sequence of fallback strategies.

- **REQ-FB-01** Define explicit fallback chains for both web_search and fetch_content operations.

- **REQ-FB-02** Attempt each fallback automatically on failure (HTTP error, timeout, empty content, CAPTCHA detection) without requiring agent intervention.

- **REQ-FB-03** Log which strategy succeeded so the agent and user can observe reliability patterns.

Reference fallback chains (from pi-web-access):

**web_search:**

- Exa (direct API with key / MCP without key)
  - Perplexity

  - Gemini API

  - Gemini Web (if browser cookies enabled)

**fetch_content:**

- Video file → Gemini API (Files API)
  - GitHub URL → clone repo

  - YouTube URL → Gemini Web → Gemini API → Perplexity

  - PDF → text extraction → save to disk

  - HTML → Readability → RSC parser → Jina Reader → Gemini fallback

  - Text / JSON / Markdown → return directly

## **5.6 Token Management**

Unmanaged web content is the primary source of context window exhaustion in agentic web tasks. The tool must actively manage how much content enters the context.

- **REQ-TM-01** Apply content extraction before injecting any fetched content into the agent context (see REQ-CE-01).

- **REQ-TM-02** Where a prompt-filtered fetch mode exists, apply the agent's query as a filter at fetch time, returning only relevant passages.

- **REQ-TM-03** For large documents (PDFs, cloned repositories), save to disk and return a path \+ summary rather than full contents.

- **REQ-TM-04** Support concurrent fetches (minimum 3 simultaneous) with per-request timeouts (minimum 30 seconds) to avoid stalling the agent.

# **6\. Security Requirements**

## **6.1 URL Access Control**

Unrestricted URL fetch capability is an attack surface. Malicious web pages can inject instructions that cause the agent to exfiltrate context data via crafted URLs.

- **REQ-SEC-01** SHOULD restrict fetch operations to URLs explicitly provided by the user or returned by a prior search_web tool call within the same session.

- **REQ-SEC-02** MUST NOT allow the agent to construct and fetch arbitrary URLs based on instructions received in fetched web content.

- **REQ-SEC-03** Pattern-based bash allow-lists (e.g. Bash(curl http://github.com/\*)) MUST NOT be used as a substitute for tool-level URL constraints — they are fragile and bypassable.

- **REQ-SEC-04** Implementations that cannot enforce REQ-SEC-01 at the tool level MUST document this limitation explicitly.

## **6.2 Credential Handling**

- **REQ-SEC-05** API keys and browser credentials MUST NOT be logged or included in content returned to the agent.

- **REQ-SEC-06** Browser cookie extraction for authenticated fetch modes MUST be opt-in and clearly documented.

- **REQ-SEC-07** Credential files MUST be stored with restrictive permissions (mode 0600 or equivalent).

## **6.3 Package Security**

- **REQ-SEC-08** Third-party extensions execute with full system access. Users MUST review source code before installation.

- **REQ-SEC-09** Extensions MUST NOT reverse-engineer or reuse credentials from third-party commercial services in ways that violate those services' terms of service.

# **7\. Performance Requirements**

- **REQ-PERF-01** Search results MUST be returned within 10 seconds under normal network conditions.

- **REQ-PERF-02** Content fetch MUST complete within 30 seconds per URL or surface a timeout error.

- **REQ-PERF-03** The tool MUST support a minimum of 3 concurrent fetch operations.

- **REQ-PERF-04** System prompt overhead for registered tools MUST be documented; target is under 1,000 tokens per tool pair.

- **REQ-PERF-05** Session-scoped caches (repository clones, extracted PDFs) MUST be purged on session end to avoid cross-session data leakage.

# **8\. Capability Comparison**

The following table summarises how the three implementation approaches compare against the requirements defined in this document.

| Capability                          | curl / bash | Pi Extensions        | Claude Code | Notes                                           |
| :---------------------------------- | :---------- | :------------------- | :---------- | :---------------------------------------------- |
| **Content extraction (clean text)** | ✗           | ✓                    | ✓           | Strips HTML noise, returns readable prose       |
| **JavaScript / SPA rendering**      | ✗           | Some (browser-based) | ✗           | Requires headless browser execution             |
| **Structured search results**       | ✗           | ✓                    | ✓           | Clean {title, url, snippet, date} objects       |
| **Anti-bot / CAPTCHA bypass**       | ✗           | Some                 | Partial     | Real browser fingerprints help                  |
| **PDF text extraction**             | ✗           | Some                 | Partial     | Text only; no OCR for scanned docs              |
| **GitHub URL cloning**              | ✗           | Some                 | ✗           | Returns real file contents, not scraped HTML    |
| **YouTube / video understanding**   | ✗           | Some                 | ✗           | Transcript \+ visual description via model      |
| **Fallback chains**                 | ✗           | ✓                    | ✗           | Auto-retries on failure across providers        |
| **Token-efficient output**          | ✗           | ✓                    | ✓           | Filters irrelevant content before context       |
| **URL security constraint**         | ✗           | ✗                    | ✓           | Only fetches user-provided or prior-result URLs |
| **Rate limiting / caching**         | ✗           | ✓                    | ✓           | Prevents throttling mid-task                    |

# **9\. Requirements Register**

| ID              | Title                        | Description                                                | Priority | Source |
| :-------------- | :--------------------------- | :--------------------------------------------------------- | :------- | :----- |
| **REQ-CE-01**   | **HTML Stripping**           | Remove all non-content HTML before injecting into context  | MUST     | §5.1   |
| **REQ-CE-02**   | **Readability Extraction**   | Use Readability or equivalent to isolate document body     | MUST     | §5.1   |
| **REQ-CE-03**   | **Structure Preservation**   | Retain headings, paragraphs, code blocks in output         | MUST     | §5.1   |
| **REQ-CE-04**   | **Prompt-Filtered Fetch**    | Return only query-relevant content when mode is available  | SHOULD   | §5.1   |
| **REQ-CE-05**   | **Token Budget**             | Enforce a maximum token limit per fetched page             | MUST     | §5.1   |
| **REQ-WS-01**   | **Structured Results**       | Return {title, url, snippet, date} objects per result      | MUST     | §5.2   |
| **REQ-WS-02**   | **No-Auth Default**          | At least one provider requires no API key or subscription  | MUST     | §5.2   |
| **REQ-WS-03**   | **Paid Provider Upgrade**    | Support API key config for higher-quality providers        | SHOULD   | §5.2   |
| **REQ-WS-04**   | **Rate Limiting**            | Client-side rate limiting per provider caps                | MUST     | §5.2   |
| **REQ-WS-05**   | **Source Citations**         | Return source attribution alongside extracted content      | MUST     | §5.2   |
| **REQ-JS-01**   | **Headless Browser**         | Launch Chromium-family browser for JS-rendered pages       | SHOULD   | §5.3   |
| **REQ-JS-02**   | **Browser Auto-Detect**      | Auto-detect installed browsers on Linux/macOS/Windows      | SHOULD   | §5.3   |
| **REQ-JS-03**   | **Content Stabilisation**    | Wait for network idle before extracting content            | MUST     | §5.3   |
| **REQ-JS-04**   | **Session Reuse**            | Reuse browser sessions within a task                       | SHOULD   | §5.3   |
| **REQ-JS-05**   | **Browser Fallback**         | Degrade to static HTTP if browser unavailable              | MUST     | §5.3   |
| **REQ-PDF-01**  | **PDF Detection**            | Detect PDF by MIME type or URL suffix                      | MUST     | §5.4   |
| **REQ-PDF-02**  | **PDF Extraction**           | Extract text and save as markdown to local disk            | MUST     | §5.4   |
| **REQ-PDF-03**  | **PDF Path Return**          | Return summary and local path, not full contents           | MUST     | §5.4   |
| **REQ-GH-01**   | **GitHub Routing**           | Route github.com URLs to clone, not HTML scrape            | SHOULD   | §5.4   |
| **REQ-GH-05**   | **Clone Caching**            | Cache clones per session; purge on session change          | MUST     | §5.4   |
| **REQ-FB-01**   | **Fallback Chains**          | Define ordered fallback sequences for all operations       | MUST     | §5.5   |
| **REQ-FB-02**   | **Auto-Retry**               | Attempt fallbacks automatically without agent intervention | MUST     | §5.5   |
| **REQ-TM-01**   | **Pre-Injection Extraction** | Extract content before injecting into context              | MUST     | §5.6   |
| **REQ-TM-03**   | **Large Doc Offload**        | Save large docs to disk; return path \+ summary only       | MUST     | §5.6   |
| **REQ-SEC-01**  | **URL Allow-List**           | Restrict fetch to user-provided or search-result URLs      | SHOULD   | §6.1   |
| **REQ-SEC-02**  | **No Arbitrary Fetch**       | Prevent agent from fetching attacker-constructed URLs      | MUST     | §6.1   |
| **REQ-SEC-05**  | **No Credential Leakage**    | API keys must not be returned in content to agent          | MUST     | §6.2   |
| **REQ-SEC-08**  | **Package Review**           | Users must review extension source before installing       | MUST     | §6.3   |
| **REQ-PERF-01** | **Search Latency**           | Search results within 10 seconds under normal conditions   | MUST     | §7     |
| **REQ-PERF-02** | **Fetch Timeout**            | Content fetch completes within 30 seconds or errors        | MUST     | §7     |
| **REQ-PERF-03** | **Concurrency**              | Minimum 3 concurrent fetch operations supported            | SHOULD   | §7     |

# **10\. Known Limitations**

- No OCR support: scanned or image-based PDFs cannot be extracted by any current implementation.

- JavaScript rendering requires a local browser installation; server-only or container environments may not have one available.

- The URL security constraint (REQ-SEC-01) is only enforced natively in Claude Code. Pi extensions cannot replicate this at the tool level — it would require custom extension logic per implementation.

- YouTube age-restricted and private videos fail across all current extraction paths.

- Gemini-based fallbacks in pi-web-access require either a Gemini API key or a signed-in Chrome/Arc/Helium browser; neither is strictly zero-config.

- Browser-automation extensions (greedysearch-pi, pi-web-browse) add significant startup latency compared to direct API calls.

# **11\. Open Questions**

1. Should the URL security constraint be a hard MUST for all conforming implementations, or remain a SHOULD given that Pi extensions cannot enforce it at the model level?

2. What is the acceptable token budget ceiling per fetched page (REQ-CE-05)? A concrete number (e.g. 8,000 tokens) should be defined.

3. Should video understanding (REQ-VID-01 through REQ-VID-04) be in-scope for a minimal conforming implementation or treated as an optional extension?

4. Is Parallel Search MCP a viable long-term zero-auth default given that it is operated by a third party with no stated SLA?
