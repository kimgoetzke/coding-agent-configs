/**
 * Web Tools extension
 *
 * Registers two LLM-callable tools:
 *   - web_search: searches via DuckDuckGo HTML → Bing → SearXNG (optional) → Wikipedia.
 *     Returns structured {title, url, snippet}[] results.
 *     Seeds the URL allow-list with every result URL.
 *   - fetch_content: fetches a URL, extracts clean prose via Readability, and returns
 *     it within the configured token budget.
 *     Rejects URLs not in the allow-list (must come from a prior web_search
 *     result or from a URL the user typed explicitly in the same turn).
 *
 * Configuration (optional): ~/.pi/agent/web-tools.json
 *   {
 *     searxngUrl?: string,
 *     defaultMaxTokens?: number,
 *     providers?: string[],
 *     forceVerbatimContentFetch?: Array<{ host?: string; subdomain?: string; pathPrefix?: string }>
 *   }
 *
 * Lifecycle hooks:
 *   - session_start (fresh reasons): clears the allow-list
 *   - before_agent_start: seeds the allow-list from URLs in the user prompt
 *
 * Rendering: both tools support Ctrl+O expand showing provider, model, and a
 * preview of results/content.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";

import { closeBrowserSession, fetchWithBrowser, prewarmBrowserSession } from "./browser-fetcher.js";
import { ConcurrencyLimiter } from "./concurrency.js";
import { loadConfig } from "./config.js";
import {
  DEFAULT_MAX_TOKENS,
  MAX_TOKENS_CAP,
  extractContent,
  isLikelyJSRendered,
} from "./content-extractor.js";
import { clearCloneCache, fetchGitHubContent, parseGitHubUrl } from "./github-router.js";
import { truncateBody } from "./rendering.js";
import { type ProviderAttempt, type SearchResult, search } from "./search-providers.js";
import { addUrls, addUrlsFromText, clear, getAllowed, isAllowed } from "./url-allowlist.js";
import { type ResolvedModel, resolveCheapModel, summarizeContent } from "./cheap-model.js";
import {
  chooseFetchContentOutput,
  resolveFetchContentMaxTokens,
  resolveFetchContentMode,
  type AppliedFetchContentMode,
  type FetchContentMode,
} from "./fetch-content-mode.ts";

const FETCH_CONCURRENCY_LIMITER = new ConcurrencyLimiter(3);

interface WebSearchDetails {
  query: string;
  searchUrl: string;
  results: SearchResult[];
  provider: string;
  attempts: ProviderAttempt[];
  model: string;
}

interface FetchContentDetails {
  url: string;
  title: string | null;
  content: string;
  contentTokensApprox: number;
  truncated: boolean;
  requestedMode: FetchContentMode;
  responseMode: AppliedFetchContentMode;
  modeReason: string;
  queryFilter: string | null;
  queryFilterSource?: "explicit" | "prompt";
  statusCode?: number;
  source: "html" | "text" | "github-api" | "github-clone" | "browser-html";
  browserFallback?: boolean;
  model: string;
  cheapModel: string;
}

const FRESH_SESSION_REASONS = new Set(["startup", "new", "resume", "fork"]);

/**
 * Strips ANSI escape codes and the "Sent · <timestamp>" suffix appended by the
 * message-timestamps extension so that the cleaned text can be used as a
 * relevance filter without leaking UI chrome into the query.
 */
function cleanPromptForQuery(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const deAnsi = raw.replace(/\x1b\[[\d;]*[a-zA-Z]/g, "");
  const sentMarkerIdx = deAnsi.lastIndexOf("\n\nSent ·");
  return (sentMarkerIdx >= 0 ? deAnsi.slice(0, sentMarkerIdx) : deAnsi).trim();
}

const WebSearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum number of results to return (default 10, max 20)" }),
  ),
});

const FetchContentParams = Type.Object({
  url: Type.String({ description: "URL to fetch" }),
  maxTokens: Type.Optional(
    Type.Number({ description: "Maximum tokens to return; omitted uses a mode-dependent default (cap 16k)" }),
  ),
  query: Type.Optional(
    Type.String({
      description:
        "Relevance filter — only paragraphs matching this query are returned; defaults to the current session prompt",
    }),
  ),
  mode: Type.Optional(
    Type.Union([
      Type.Literal("auto"),
      Type.Literal("verbatim"),
      Type.Literal("summary"),
    ], {
      description:
        "Content fidelity mode: auto uses conservative URL rules; GitHub/code URLs default to verbatim, while explicit summary requests are honoured",
    }),
  ),
});

function describeCheapModelUsage(
  responseMode: AppliedFetchContentMode,
  resolvedModel: ResolvedModel | null,
  summaryText: string | null,
): string {
  if (responseMode === "verbatim") return "n/a - verbatim mode";
  if (resolvedModel === null) return "n/a - failed to resolve cheap model";
  if (summaryText !== null) return `${resolvedModel.provider}/${resolvedModel.id} (active)`;
  return `${resolvedModel.provider}/${resolvedModel.id} (failed)`;
}

function reportProgress(
  onUpdate: unknown,
  text: string,
  details?: Record<string, unknown>,
): void {
  if (typeof onUpdate !== "function") return;
  onUpdate({ content: [{ type: "text", text }], details });
}

function formatSearchResults(
  query: string,
  results: SearchResult[],
  provider: string,
  attempts: ProviderAttempt[],
): string {
  const lines: string[] = [];
  if (results.length === 0) {
    lines.push(`No results found for: "${query}" (via ${provider})`);
  } else {
    lines.push(`${results.length} results for "${query}" (via ${provider}):`);
    for (const [i, r] of results.entries()) {
      lines.push(`\n${i + 1}. ${r.title}`);
      lines.push(`   ${r.url}`);
      if (r.date) lines.push(`   ${r.date}`);
      if (r.snippet) lines.push(`   ${r.snippet}`);
    }
  }
  // Append notes so the agent can make informed decisions about result quality.
  if (provider === "wikipedia") {
    lines.push(
      "\n\nNote: All other providers failed or returned no results; these results are from Wikipedia only (narrow domain — consider telling the user that search quality may be limited).",
    );
  }
  const rateLimited = attempts.filter((a) => a.outcome === "rate_limited");
  if (rateLimited.length > 0) {
    lines.push(
      `\nNote: Rate limiting was applied to: ${rateLimited.map((a) => a.name).join(", ")}. If results are poor, consider waiting before retrying.`,
    );
  }
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  const { config, warning: configWarning } = loadConfig();
  if (configWarning) console.warn(configWarning);

  let lastAgentPrompt = "";
  // undefined = not yet probed; null = probed but unavailable; ResolvedModel = ready to use
  let resolvedCheapModel: ResolvedModel | null | undefined = undefined;

  const jsRenderingEnabled = config.jsRendering !== false;

  pi.on("session_start", (event: { reason: string }) => {
    if (FRESH_SESSION_REASONS.has(event.reason)) {
      clear();
      clearCloneCache();
      if (jsRenderingEnabled) void closeBrowserSession();
      resolvedCheapModel = undefined;
    }
    return undefined;
  });

  pi.on("before_agent_start", (event: { prompt: string }) => {
    addUrlsFromText(event.prompt);
    lastAgentPrompt = cleanPromptForQuery(event.prompt);
    if (jsRenderingEnabled) prewarmBrowserSession();
    return undefined;
  });

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: [
      "Search the web and return structured results (title, URL, snippet).",
      "Preferred way to search the web — use this instead of curl or bash for any web search.",
      "Tries DuckDuckGo HTML first, then Bing, then Wikipedia as a fallback. No API key required.",
      "Any URLs in the results are automatically approved for use with fetch_content.",
    ].join(" "),
    parameters: WebSearchParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const maxResults = params.maxResults ?? 10;
      let results: SearchResult[];
      let provider: string;
      let searchUrl: string;
      let attempts: ProviderAttempt[];

      try {
        ({ results, provider, searchUrl, attempts } = await search(params.query, maxResults, {
          searxngUrl: config.searxngUrl,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`web_search failed: ${message}`);
      }

      addUrls(results.map((r) => r.url));

      const content = formatSearchResults(params.query, results, provider, attempts);
      const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown";
      return {
        content: [{ type: "text", text: content }],
        details: {
          query: params.query,
          searchUrl,
          results,
          provider,
          attempts,
          model,
        } satisfies WebSearchDetails,
      };
    },

    renderCall(args, theme) {
      const preview = args.query.length > 60 ? `${args.query.slice(0, 60)}...` : args.query;
      return new Text(
        theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("accent", preview),
        0,
        0,
      );
    },

    renderResult(result, { expanded }, theme) {
      const isError = result.isError === true;
      const text = result.content[0];
      const body = text?.type === "text" ? text.text : "(no output)";

      if (isError) {
        return new Text(theme.fg("error", body), 0, 0);
      }

      const details = result.details as WebSearchDetails | undefined;
      const resultCount = details?.results.length ?? 0;

      if (!expanded || !details) {
        return new Text(
          theme.fg("toolOutput", `${resultCount} results returned`) +
            theme.fg("muted", " (Ctrl+O to expand)"),
          0,
          0,
        );
      }

      const container = new Container();
      container.addChild(
        new Text(theme.fg("dim", "term: ") + theme.fg("accent", details.query), 0, 0),
      );
      if (details.searchUrl) {
        container.addChild(
          new Text(theme.fg("dim", "url: ") + theme.fg("accent", details.searchUrl), 0, 0),
        );
      }
      const providerLines = details.attempts
        .map((a) => {
          switch (a.outcome) {
            case "success":
              return `  - ${a.name}: ${a.resultCount} results`;
            case "empty":
              return `  - ${a.name}: 0 results`;
            case "rate_limited":
              return `  - ${a.name}: rate limited`;
            case "skipped":
              return `  - ${a.name}: ${a.skipReason ?? "skipped"}`;
            case "error":
              return `  - ${a.name}: error`;
          }
        })
        .join("\n");
      container.addChild(new Text(theme.fg("dim", `providers:\n${providerLines}`), 0, 0));
      container.addChild(new Text(theme.fg("dim", `model: ${details.model}`), 0, 0));
      container.addChild(new Spacer(1));
      for (const [i, r] of details.results.entries()) {
        container.addChild(
          new Text(
            theme.fg("toolOutput", `${i + 1}. ${r.title}`) +
              "\n" +
              theme.fg("accent", `   ${r.url}`) +
              (r.date ? "\n" + theme.fg("dim", `   ${r.date}`) : "") +
              "\n" +
              theme.fg("dim", `   ${truncateBody(r.snippet, 200)}`),
            0,
            0,
          ),
        );
      }
      container.addChild(new Spacer(1));
      return container;
    },
  });

  pi.registerTool({
    name: "fetch_content",
    label: "Fetch Content",
    description: [
      "Fetch the content of a URL and return it.",
      "Preferred way to retrieve web pages — use this instead of curl or bash for any URL fetch.",
      "Only URLs from a prior web_search result or URLs the user typed explicitly are permitted.",
      "Returns verbatim extracted content or a cheap-model summary depending on mode and URL.",
      "GitHub/code URLs default to verbatim file tree/README or raw content; explicit mode=summary is honoured.",
    ].join(" "),
    parameters: FetchContentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      reportProgress(onUpdate, "fetch_content: checking URL approval");
      if (!isAllowed(params.url)) {
        const allowed = getAllowed();
        const hint =
          allowed.length === 0
            ? "No URLs are currently approved. Run web_search first."
            : `Approved URLs (${allowed.length}): ${allowed.slice(0, 5).join(", ")}${allowed.length > 5 ? ` … +${allowed.length - 5} more` : ""}`;
        throw new Error(`fetch_content blocked: "${params.url}" is not in the approved URL list. ${hint}`);
      }

      const requestedMode = params.mode ?? "auto";
      const modeDecision = resolveFetchContentMode(
        params.url,
        requestedMode,
        config.forceVerbatimContentFetch ?? [],
      );
      const maxTokens = resolveFetchContentMaxTokens(
        params.maxTokens,
        config.defaultMaxTokens,
        modeDecision.effectiveMode,
        DEFAULT_MAX_TOKENS,
        MAX_TOKENS_CAP,
      );
      const queryFilterSource: "explicit" | "prompt" = params.query != null ? "explicit" : "prompt";
      const effectiveQuery = params.query ?? lastAgentPrompt;
      const detailQuery = modeDecision.effectiveMode === "summary" ? effectiveQuery || null : null;

      reportProgress(onUpdate, `fetch_content: approved; mode ${modeDecision.effectiveMode}`, {
        requestedMode,
        effectiveMode: modeDecision.effectiveMode,
        reason: modeDecision.reason,
      });

      let summaryModel: ResolvedModel | null = null;
      if (modeDecision.effectiveMode === "summary") {
        if (resolvedCheapModel === undefined) {
          resolvedCheapModel = await resolveCheapModel(ctx.modelRegistry, config);
        }
        summaryModel = resolvedCheapModel;
      }

      const extractionQuery =
        modeDecision.effectiveMode === "summary" && summaryModel === null ? effectiveQuery : undefined;

      let extracted;
      let browserAttempted = false;
      try {
        const githubDescriptor = parseGitHubUrl(params.url);
        if (githubDescriptor) {
          reportProgress(onUpdate, "fetch_content: fetching GitHub content");
          extracted = await FETCH_CONCURRENCY_LIMITER.run(() =>
            fetchGitHubContent(githubDescriptor, maxTokens, signal ?? undefined),
          );
        } else {
          reportProgress(onUpdate, "fetch_content: extracting page content");
          const staticResult = await FETCH_CONCURRENCY_LIMITER.run(() =>
            extractContent(params.url, maxTokens, signal ?? undefined, extractionQuery),
          );
          if (
            jsRenderingEnabled &&
            (staticResult.statusCode === undefined || staticResult.statusCode < 400) &&
            isLikelyJSRendered(staticResult.content, staticResult.rawHtml ?? "")
          ) {
            browserAttempted = true;
            reportProgress(onUpdate, "fetch_content: retrying with browser rendering");
            extracted = await FETCH_CONCURRENCY_LIMITER.run(() =>
              fetchWithBrowser(params.url, maxTokens, signal ?? undefined, extractionQuery),
            );
          } else {
            extracted = staticResult;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`fetch_content failed: ${message}`);
      }
      const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown";
      if (extracted.statusCode !== undefined && extracted.statusCode >= 400) {
        const titleInfo = extracted.title ? ` Title: "${extracted.title}".` : "";
        const hint =
          extracted.statusCode === 403
            ? " Access was forbidden — the page may be paywalled, geo-restricted, or block automated access."
            : extracted.statusCode >= 500
            ? " The server returned an error."
            : "";
        return {
          content: [
            {
              type: "text",
              text: `fetch_content: HTTP ${extracted.statusCode}.${titleInfo}${hint}`,
            },
          ],
          details: {
            url: extracted.url,
            title: extracted.title,
            content: "",
            contentTokensApprox: 0,
            truncated: false,
            requestedMode,
            responseMode: modeDecision.effectiveMode,
            modeReason: modeDecision.reason,
            queryFilter: detailQuery,
            queryFilterSource: detailQuery !== null ? queryFilterSource : undefined,
            statusCode: extracted.statusCode,
            source: extracted.source,
            browserFallback:
              browserAttempted && extracted.source !== "browser-html" ? true : undefined,
            model,
            cheapModel: describeCheapModelUsage(modeDecision.effectiveMode, summaryModel, null),
          } satisfies FetchContentDetails,
        };
      }

      if (modeDecision.effectiveMode === "summary" && summaryModel !== null) {
        reportProgress(onUpdate, "fetch_content: summarising extracted content");
      }
      const summaryText =
        modeDecision.effectiveMode === "summary" && summaryModel !== null
          ? await summarizeContent(
              summaryModel,
              extracted.content,
              effectiveQuery,
              signal ?? undefined,
            )
          : null;

      const selectedOutput = chooseFetchContentOutput(
        modeDecision,
        extracted,
        summaryText,
        maxTokens,
      );
      return {
        content: [{ type: "text", text: selectedOutput.agentContent }],
        details: {
          url: extracted.url,
          title: extracted.title,
          content: selectedOutput.detailsContent,
          contentTokensApprox: Math.round(selectedOutput.detailsContent.length / 4),
          truncated: extracted.truncated,
          requestedMode,
          responseMode: selectedOutput.returnedMode,
          modeReason: modeDecision.reason,
          queryFilter: detailQuery,
          queryFilterSource: detailQuery !== null ? queryFilterSource : undefined,
          statusCode: extracted.statusCode,
          source: extracted.source,
          browserFallback:
            browserAttempted && extracted.source !== "browser-html" ? true : undefined,
          model,
          cheapModel: describeCheapModelUsage(
            selectedOutput.returnedMode,
            summaryModel,
            summaryText,
          ),
        } satisfies FetchContentDetails,
      };
    },

    renderCall(args, theme) {
      const preview = args.url.length > 70 ? `${args.url.slice(0, 70)}...` : args.url;
      return new Text(
        theme.fg("toolTitle", theme.bold("fetch_content ")) + theme.fg("accent", preview),
        0,
        0,
      );
    },

    renderResult(result, { expanded }, theme) {
      const isError = result.isError === true;
      const text = result.content[0];
      const body = text?.type === "text" ? text.text : "(no output)";

      const details = result.details as FetchContentDetails | undefined;
      const httpError =
        details !== undefined &&
        details.statusCode !== undefined &&
        details.statusCode >= 400;
      const tokenCount = details?.contentTokensApprox ?? Math.round(body.length / 4);
      const truncated = details?.truncated ?? false;

      // Genuine errors without details (URL blocked, network failure, etc.)
      if (isError && !details) {
        return new Text(theme.fg("error", body), 0, 0);
      }

      if (!expanded || !details) {
        if (httpError) {
          return new Text(
            theme.fg("error", `HTTP ${details!.statusCode} error`) +
              theme.fg("muted", " (Ctrl+O to expand)"),
            0,
            0,
          );
        }
        const truncNote = truncated ? " (truncated)" : "";
        const modeNote = details?.responseMode === "summary" ? " (summary)" : "";
        return new Text(
          theme.fg("toolOutput", `~${tokenCount} tokens returned${truncNote}${modeNote}`) +
            theme.fg("muted", " (Ctrl+O to expand)"),
          0,
          0,
        );
      }

      const container = new Container();
      container.addChild(
        new Text(theme.fg("dim", "url: ") + theme.fg("accent", details.url), 0, 0),
      );
      container.addChild(
        new Text(
          theme.fg("dim", "title: ") + theme.fg("toolOutput", details.title ?? "(none)"),
          0,
          0,
        ),
      );
      const viaLabel = details.browserFallback
        ? `${details.source} (browser attempted, fell back)`
        : details.source;
      container.addChild(new Text(theme.fg("dim", "via: ") + theme.fg("dim", viaLabel), 0, 0));
      container.addChild(
        new Text(
          theme.fg("dim", `mode: requested ${details.requestedMode}, returned ${details.responseMode}`),
          0,
          0,
        ),
      );
      container.addChild(new Text(theme.fg("dim", `mode reason: ${details.modeReason}`), 0, 0));
      if (details.queryFilter) {
        const filterValue =
          details.queryFilterSource === "prompt"
            ? "(full user prompt)"
            : details.queryFilter.length > 80
            ? details.queryFilter.slice(0, 80)
            : details.queryFilter;
        container.addChild(
          new Text(theme.fg("dim", "filter: ") + theme.fg("dim", filterValue), 0, 0),
        );
      }
      container.addChild(new Text(theme.fg("dim", `model: ${details.model}`), 0, 0));
      container.addChild(new Text(theme.fg("dim", `summarised by: ${details.cheapModel}`), 0, 0));
      container.addChild(new Spacer(1));
      if (httpError) {
        const hint =
          details.statusCode === 403
            ? "access forbidden — paywalled, geo-restricted, or blocks automated access"
            : details.statusCode! >= 500
            ? "server error"
            : "request failed";
        container.addChild(
          new Text(theme.fg("error", `HTTP ${details.statusCode} — ${hint}`), 0, 0),
        );
      } else {
        container.addChild(
          new Text(theme.fg("toolOutput", truncateBody(details.content, 2000)), 0, 0),
        );
      }
      container.addChild(new Spacer(1));
      const footer = `~${details.contentTokensApprox} tokens${details.truncated ? " (truncated)" : ""}`;
      container.addChild(new Text(theme.fg("dim", footer), 0, 0));
      return container;
    },
  });
}
