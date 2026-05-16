import { chromium, type Browser, type BrowserContext } from "playwright";

import { applyPromptFilter } from "./prompt-filter.ts";
import {
  DEFAULT_MAX_TOKENS,
  type ExtractionResult,
  applyTokenBudget,
  extractContent,
  extractFromHtml,
} from "./content-extractor.ts";

let browserInstance: Browser | null = null;

export async function getBrowserSession(): Promise<Browser> {
  if (browserInstance === null) {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
    browserInstance = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  }
  return browserInstance;
}

/**
 * Fire-and-forget pre-warm called from before_agent_start to hide launch latency.
 */
export function prewarmBrowserSession(): void {
  void getBrowserSession();
}

export async function closeBrowserSession(): Promise<void> {
  if (browserInstance !== null) {
    if (browserInstance.isConnected()) {
      await browserInstance.close();
    }
    browserInstance = null;
  }
}

export async function fetchWithBrowser(
  url: string,
  maxTokens = DEFAULT_MAX_TOKENS,
  signal?: AbortSignal,
  query?: string,
  networkidleTimeoutMs = 15_000,
): Promise<ExtractionResult> {
  let context: BrowserContext | null = null;
  try {
    const browser = await getBrowserSession();
    context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: networkidleTimeoutMs });
    } catch {
      // Soft failure — networkidle timed out; proceed with whatever is rendered.
    }

    const html = await page.content();
    const extracted = extractFromHtml(html, url);
    const text = query ? applyPromptFilter(extracted.markdown, query) : extracted.markdown;
    const { content, truncated } = applyTokenBudget(text, maxTokens);

    return {
      url,
      title: extracted.title,
      content,
      contentTokensApprox: Math.round(content.length / 4),
      truncated,
      source: "browser-html",
    };
  } catch {
    return extractContent(url, maxTokens, signal, query);
  } finally {
    if (context !== null) {
      try {
        await context.close();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}
