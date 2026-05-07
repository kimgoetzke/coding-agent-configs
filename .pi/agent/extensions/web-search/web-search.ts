/**
 * Web Search extension — Phase 4: Real search provider chain
 *
 * Registers two LLM-callable tools:
 *   - web_search: searches via DuckDuckGo HTML → SearXNG (optional) → Wikipedia.
 *     Returns structured {title, url, snippet}[] results.
 *     Seeds the URL allow-list with every result URL.
 *   - fetch_content: fetches a URL and returns the raw response body.
 *     Rejects URLs not in the allow-list (must come from a prior web_search
 *     result or from a URL the user typed explicitly in the same turn).
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

import { DEFAULT_MAX_TOKENS, extractContent } from "./content-extractor.js";
import { truncateBody } from "./rendering.js";
import { type SearchResult, search } from "./search-providers.js";
import { addUrls, addUrlsFromText, clear, getAllowed, isAllowed } from "./url-allowlist.js";

interface WebSearchDetails {
  query: string;
  results: SearchResult[];
  provider: string;
  model: string;
}

interface FetchContentDetails {
  url: string;
  title: string | null;
  content: string;
  contentTokensApprox: number;
  truncated: boolean;
  model: string;
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
});

function formatSearchResults(query: string, results: SearchResult[], provider: string): string {
  if (results.length === 0) return `No results found for: "${query}" (via ${provider})`;
  const lines = [`${results.length} results for "${query}" (via ${provider}):`];
  for (const [i, r] of results.entries()) {
    lines.push(`\n${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
  }
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (event: { reason: string }) => {
    if (FRESH_SESSION_REASONS.has(event.reason)) {
      clear();
    }
    return undefined;
  });

  pi.on("before_agent_start", (event: { prompt: string }) => {
    addUrlsFromText(event.prompt);
    return undefined;
  });

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: [
      "Search the web and return structured results (title, URL, snippet).",
      "Preferred way to search the web — use this instead of curl or bash for any web search.",
      "Tries DuckDuckGo HTML first, then Wikipedia as a fallback. No API key required.",
      "Any URLs in the results are automatically approved for use with fetch_content.",
    ].join(" "),
    parameters: WebSearchParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const maxResults = params.maxResults ?? 10;
      let results: SearchResult[];
      let provider: string;

      try {
        ({ results, provider } = await search(params.query, maxResults));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `web_search failed: ${message}` }],
          isError: true,
        };
      }

      addUrls(results.map((r) => r.url));

      const content = formatSearchResults(params.query, results, provider);
      const model = ctx.model?.id ?? "unknown";
      return {
        content: [{ type: "text", text: content }],
        details: { query: params.query, results, provider, model } satisfies WebSearchDetails,
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
          theme.fg("toolOutput", `${resultCount} results returned`) + theme.fg("muted", " (Ctrl+O to expand)"),
          0,
          0,
        );
      }

      const container = new Container();
      container.addChild(new Text(
        theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("accent", details.query),
        0, 0,
      ));
      container.addChild(new Text(
        theme.fg("dim", `${details.provider} · ${details.model}`),
        0, 0,
      ));
      container.addChild(new Spacer(1));
      for (const [i, r] of details.results.entries()) {
        container.addChild(new Text(
          theme.fg("toolOutput", `${i + 1}. ${r.title}`) + "\n" +
          theme.fg("accent", `   ${r.url}`) + "\n" +
          theme.fg("dim", `   ${truncateBody(r.snippet, 200)}`),
          0, 0,
        ));
      }
      container.addChild(new Spacer(1));
      container.addChild(new Text(
        theme.fg("dim", `${resultCount} results via ${details.provider}`),
        0, 0,
      ));
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

      const maxTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;
      let extracted;
      try {
        extracted = await extractContent(params.url, maxTokens, signal ?? undefined);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `fetch_content failed: ${message}` }],
          isError: true,
        };
      }

      const model = ctx.model?.id ?? "unknown";
      const truncationNote = extracted.truncated
        ? `\n\n[Content truncated to ~${maxTokens} tokens]`
        : "";
      return {
        content: [{ type: "text", text: extracted.content + truncationNote }],
        details: {
          url: extracted.url,
          title: extracted.title,
          content: extracted.content,
          contentTokensApprox: extracted.contentTokensApprox,
          truncated: extracted.truncated,
          model,
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
          theme.fg("toolOutput", `~${tokenCount} tokens returned${truncNote}`) + theme.fg("muted", " (Ctrl+O to expand)"),
          0,
          0,
        );
      }

      const container = new Container();
      const titleLine = details.title ? ` · ${details.title}` : "";
      container.addChild(new Text(
        theme.fg("toolTitle", theme.bold("fetch_content ")) + theme.fg("accent", details.url) + theme.fg("dim", titleLine),
        0, 0,
      ));
      container.addChild(new Text(
        theme.fg("dim", `model: ${details.model}`),
        0, 0,
      ));
      container.addChild(new Spacer(1));
      container.addChild(new Text(
        theme.fg("toolOutput", truncateBody(details.content, 4000)),
        0, 0,
      ));
      container.addChild(new Spacer(1));
      const footer = `~${details.contentTokensApprox} tokens${details.truncated ? " (truncated)" : ""}`;
      container.addChild(new Text(
        theme.fg("dim", footer),
        0, 0,
      ));
      return container;
    },
  });
}
