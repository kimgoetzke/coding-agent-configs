/**
 * Content extractor — Phase 5
 *
 * Fetches a URL, detects HTML via Content-Type, runs @mozilla/readability
 * to strip nav/ads/boilerplate, converts the extracted article to markdown,
 * and applies a token budget before returning to the agent.
 *
 * Non-HTML responses are returned verbatim up to the budget.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import { applyPromptFilter } from "./prompt-filter.ts";

export const DEFAULT_MAX_TOKENS = 8_000;
const MAX_TOKENS_CAP = 16_000;

const RAW_BYTE_LIMIT = 256 * 1024;

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0";

export interface ExtractionResult {
  url: string;
  title: string | null;
  content: string;
  contentTokensApprox: number;
  truncated: boolean;
  statusCode?: number;
  source: "html" | "text" | "github-api" | "github-clone" | "browser-html";
  rawHtml?: string;
}

// ── Token budget ──────────────────────────────────────────────────────────────

export function applyTokenBudget(
  text: string,
  maxTokens: number,
): { content: string; truncated: boolean } {
  const charBudget = Math.min(maxTokens, MAX_TOKENS_CAP) * 4;
  if (text.length <= charBudget) {
    return { content: text, truncated: false };
  }

  // Try to truncate at a paragraph boundary.
  const slice = text.slice(0, charBudget);
  const lastBreak = slice.lastIndexOf("\n\n");
  const cutAt = lastBreak > 0 ? lastBreak : charBudget;
  const kept = text.slice(0, cutAt);
  const remainingChars = text.length - cutAt;
  const remainingTokens = Math.round(remainingChars / 4);
  return {
    content: `${kept}\n\n…[truncated: ${remainingTokens} more tokens approx]`,
    truncated: true,
  };
}

// ── HTML → markdown ───────────────────────────────────────────────────────────

function nodeToMarkdown(node: any, depth = 0): string {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) {
    return "";
  }

  const tag = (node.tagName ?? "").toLowerCase();
  const children = Array.from(node.childNodes as any[]);
  const inner = () => children.map((c) => nodeToMarkdown(c, depth)).join("");

  switch (tag) {
    case "h1":
      return `\n\n# ${inner().trim()}\n\n`;
    case "h2":
      return `\n\n## ${inner().trim()}\n\n`;
    case "h3":
      return `\n\n### ${inner().trim()}\n\n`;
    case "h4":
      return `\n\n#### ${inner().trim()}\n\n`;
    case "h5":
      return `\n\n##### ${inner().trim()}\n\n`;
    case "h6":
      return `\n\n###### ${inner().trim()}\n\n`;
    case "p":
      return `\n\n${inner().trim()}\n\n`;
    case "br":
      return "\n";
    case "ul":
      return `\n\n${children.map((c) => nodeToMarkdown(c, depth)).join("")}\n`;
    case "ol": {
      let index = 0;
      return `\n\n${children
        .map((c) => {
          if ((c.tagName ?? "").toLowerCase() === "li") {
            index++;
            return `${index}. ${nodeToMarkdown(c, depth).trim()}\n`;
          }
          return nodeToMarkdown(c, depth);
        })
        .join("")}\n`;
    }
    case "li":
      return `- ${inner().trim()}\n`;
    case "pre": {
      const codeNode = children.find((c) => (c.tagName ?? "").toLowerCase() === "code");
      const codeContent = codeNode ? (codeNode.textContent ?? "") : inner();
      return `\n\n\`\`\`\n${codeContent}\n\`\`\`\n\n`;
    }
    case "code": {
      // Inline code — only if not inside a pre (caller handles pre>code).
      return `\`${node.textContent ?? ""}\``;
    }
    case "a": {
      const href = node.getAttribute?.("href") ?? "";
      const text = inner().trim();
      if (!href || href === text) return text;
      return `[${text}](${href})`;
    }
    case "strong":
    case "b":
      return `**${inner()}**`;
    case "em":
    case "i":
      return `_${inner()}_`;
    case "blockquote":
      return `\n\n> ${inner().trim().replace(/\n/g, "\n> ")}\n\n`;
    case "hr":
      return "\n\n---\n\n";
    case "script":
    case "style":
    case "nav":
    case "footer":
    case "aside":
    case "header":
    case "form":
    case "noscript":
      return "";
    default:
      return inner();
  }
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/^[ \t]+$/gm, "") // blank lines that contain only spaces/tabs
    .replace(/\n{3,}/g, "\n\n") // 3+ consecutive newlines → 2
    .trim();
}

// ── HTML extraction ───────────────────────────────────────────────────────────

export function extractFromHtml(
  html: string,
  url: string,
): { title: string | null; markdown: string } {
  const { document } = parseHTML(html);
  // Readability mutates the document, so parse a fresh one for it.
  const { document: docForReadability } = parseHTML(html);

  let title: string | null = null;
  let markdown: string;

  try {
    const article = new Readability(docForReadability as unknown as Document).parse();
    if (article) {
      title = article.title ?? null;
      // Wrap in full HTML so linkedom places content in document.body
      // (parseHTML puts fragments in documentElement, not body).
      const { document: articleDoc } = parseHTML(`<html><body>${article.content}</body></html>`);
      markdown = collapseWhitespace(nodeToMarkdown(articleDoc.body));
    } else {
      // Readability couldn't parse — fall back to raw body text.
      markdown = collapseWhitespace(nodeToMarkdown(document.body));
    }
  } catch {
    markdown = collapseWhitespace(nodeToMarkdown(document.body));
  }

  return { title, markdown };
}

// ── JS-rendered page heuristic ───────────────────────────────────────────────

export function isLikelyJSRendered(markdown: string, rawHtml: string): boolean {
  const scriptCount = (rawHtml.match(/<script/gi) ?? []).length;
  return markdown.trim().length < 500 && scriptCount > 3;
}

// ── Main async entry point ────────────────────────────────────────────────────

export async function extractContent(
  url: string,
  maxTokens = DEFAULT_MAX_TOKENS,
  signal?: AbortSignal,
  query?: string,
): Promise<ExtractionResult> {
  const effectiveSignal = signal ?? AbortSignal.timeout(30_000);

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: effectiveSignal,
    redirect: "follow",
  });

  const buffer = await response.arrayBuffer();
  const rawSlice = buffer.byteLength > RAW_BYTE_LIMIT ? buffer.slice(0, RAW_BYTE_LIMIT) : buffer;
  const rawBody = new TextDecoder().decode(rawSlice);

  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");

  let title: string | null = null;
  let text: string;

  if (isHtml) {
    const extracted = extractFromHtml(rawBody, url);
    title = extracted.title;
    text = query ? applyPromptFilter(extracted.markdown, query) : extracted.markdown;
  } else {
    text = rawBody;
  }

  const { content, truncated } = applyTokenBudget(text, maxTokens);
  return {
    url,
    title,
    content,
    contentTokensApprox: Math.round(content.length / 4),
    truncated,
    statusCode: response.status,
    source: isHtml ? "html" : "text",
    ...(isHtml ? { rawHtml: rawBody } : {}),
  };
}
