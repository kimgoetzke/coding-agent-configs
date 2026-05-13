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
 *   { searxngUrl?: string, defaultMaxTokens?: number, providers?: string[] }
 *
 * Lifecycle hooks:
 *   - session_start (fresh reasons): clears the allow-list
 *   - before_agent_start: seeds the allow-list from URLs in the user prompt
 *
 * Rendering: both tools support Ctrl+O expand showing provider, model, and a
 * preview of results/content.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { ConcurrencyLimiter } from "./concurrency.js";
import { loadConfig } from "./config.js";
import { DEFAULT_MAX_TOKENS, extractContent } from "./content-extractor.js";
import { clearCloneCache, fetchGitHubContent, parseGitHubUrl } from "./github-router.js";
import { truncateBody } from "./rendering.js";
import { type ProviderAttempt, type SearchResult, search } from "./search-providers.js";
import { addUrls, addUrlsFromText, clear, getAllowed, isAllowed } from "./url-allowlist.js";
import { type ResolvedModel, resolveCheapModel, summarizeContent } from "./cheap-model.js";

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
  queryFilter: string | null;
  source: "html" | "text" | "github-api" | "github-clone";
  model: string;
  cheapModel: string;
}

const FRESH_SESSION_REASONS = new Set(["startup", "new", "resume", "fork"]);

const WebSearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum number of results to return (default 10, max 20)" }),
  ),
});

const FetchContentParams = Type.Object({
  url: Type.String({ description: "URL to fetch" }),
  maxTokens: Type.Optional(
    Type.Number({ description: "Maximum tokens to return (reserved for Phase 5)" }),
  ),
  query: Type.Optional(
    Type.String({
      description:
        "Relevance filter — only paragraphs matching this query are returned; defaults to the current session prompt",
    }),
  ),
});

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

  pi.on("session_start", (event: { reason: string }) => {
    if (FRESH_SESSION_REASONS.has(event.reason)) {
      clear();
      clearCloneCache();
      resolvedCheapModel = undefined;
    }
    return undefined;
  });

  pi.on("before_agent_start", (event: { prompt: string }) => {
    addUrlsFromText(event.prompt);
    lastAgentPrompt = event.prompt;
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
        return {
          content: [{ type: "text", text: `web_search failed: ${message}` }],
          isError: true,
        };
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
      "Returns the raw response body.",
    ].join(" "),
    parameters: FetchContentParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!isAllowed(params.url)) {
        const allowed = getAllowed();
        const hint =
          allowed.length === 0
            ? "No URLs are currently approved. Run web_search first."
            : `Approved URLs (${allowed.length}): ${allowed.slice(0, 5).join(", ")}${allowed.length > 5 ? ` … +${allowed.length - 5} more` : ""}`;
        return {
          content: [
            {
              type: "text",
              text: `fetch_content blocked: "${params.url}" is not in the approved URL list. ${hint}`,
            },
          ],
          isError: true,
        };
      }

      const maxTokens = params.maxTokens ?? config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
      const effectiveQuery = params.query ?? lastAgentPrompt;

      // Resolve cheap model before extracting so we can skip the prompt filter
      // when a cheap model is available — it does its own relevance filtering,
      // and pre-filtering strips context the cheap model needs to summarise well.
      if (resolvedCheapModel === undefined) {
        resolvedCheapModel = await resolveCheapModel(ctx.modelRegistry, config);
      }

      let extracted;
      try {
        const githubDescriptor = parseGitHubUrl(params.url);
        extracted = await FETCH_CONCURRENCY_LIMITER.run(() =>
          githubDescriptor
            ? fetchGitHubContent(githubDescriptor, maxTokens, signal ?? undefined)
            : extractContent(
                params.url,
                maxTokens,
                signal ?? undefined,
                resolvedCheapModel !== null ? undefined : effectiveQuery,
              ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `fetch_content failed: ${message}` }],
          isError: true,
        };
      }
      const summaryText =
        resolvedCheapModel !== null
          ? await summarizeContent(
              resolvedCheapModel,
              extracted.content,
              effectiveQuery,
              signal ?? undefined,
            )
          : null;

      const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown";
      const truncationNote = extracted.truncated
        ? `\n\n[Content truncated to ~${maxTokens} tokens]`
        : "";
      const agentContent = summaryText ?? extracted.content + truncationNote;
      return {
        content: [{ type: "text", text: agentContent }],
        details: {
          url: extracted.url,
          title: extracted.title,
          content: summaryText ?? extracted.content,
          contentTokensApprox: extracted.contentTokensApprox,
          truncated: extracted.truncated,
          queryFilter: effectiveQuery || null,
          source: extracted.source,
          model,
          cheapModel:
            resolvedCheapModel === null
              ? "n/a - failed to resolve cheap model"
              : summaryText !== null
                ? `${resolvedCheapModel.provider}/${resolvedCheapModel.id} (active)`
                : `${resolvedCheapModel.provider}/${resolvedCheapModel.id} (failed)`,
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

      if (isError) {
        return new Text(theme.fg("error", body), 0, 0);
      }

      const details = result.details as FetchContentDetails | undefined;
      const tokenCount = details?.contentTokensApprox ?? Math.round(body.length / 4);
      const truncated = details?.truncated ?? false;

      if (!expanded || !details) {
        const truncNote = truncated ? " (truncated)" : "";
        return new Text(
          theme.fg("toolOutput", `~${tokenCount} tokens returned${truncNote}`) +
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
      container.addChild(
        new Text(theme.fg("dim", "via: ") + theme.fg("dim", details.source), 0, 0),
      );
      if (details.queryFilter) {
        container.addChild(
          new Text(
            theme.fg("dim", "filter: ") +
              theme.fg(
                "dim",
                details.queryFilter.length > 80
                  ? `${details.queryFilter.slice(0, 80)}…`
                  : details.queryFilter,
              ),
            0,
            0,
          ),
        );
      }
      container.addChild(new Text(theme.fg("dim", `model: ${details.model}`), 0, 0));
      container.addChild(new Text(theme.fg("dim", `summarised by: ${details.cheapModel}`), 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(theme.fg("toolOutput", truncateBody(details.content, 2000)), 0, 0),
      );
      container.addChild(new Spacer(1));
      const footer = `~${details.contentTokensApprox} tokens${details.truncated ? " (truncated)" : ""}`;
      container.addChild(new Text(theme.fg("dim", footer), 0, 0));
      return container;
    },
  });
}
