import { complete } from "@earendil-works/pi-ai";
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ProviderStreamOptions,
} from "@earendil-works/pi-ai";

import type { WebSearchConfig } from "./config.js";

export const DEFAULT_CHEAP_MODEL_CANDIDATES: string[] = [
  "github-copilot/gpt-5-mini",
  "anthropic/claude-haiku-4-5-20251001",
  "github-copilot/claude-haiku-4.5",
  "github-copilot/gpt-5.4-mini",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4.1-nano",
  "openai/gpt-4o-mini",
  "openai/gpt-5-mini",
  "deepseek/deepseek-chat",
];

export interface ResolvedModel {
  provider: string;
  id: string;
  model: Model<Api>;
  apiKey?: string;
  headers?: Record<string, string>;
}

interface ModelFinder {
  find(provider: string, modelId: string): Model<Api> | undefined;
  getApiKeyAndHeaders(
    model: Model<Api>,
  ): Promise<
    { ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string }
  >;
}

export function parseModelCandidate(raw: string): { provider: string; id: string } | null {
  const slashIndex = raw.indexOf("/");
  if (slashIndex < 1 || slashIndex === raw.length - 1) return null;
  return {
    provider: raw.slice(0, slashIndex),
    id: raw.slice(slashIndex + 1),
  };
}

export async function resolveCheapModel(
  modelRegistry: ModelFinder,
  config: Pick<WebSearchConfig, "cheapModels">,
): Promise<ResolvedModel | null> {
  const candidateStrings = config.cheapModels ?? DEFAULT_CHEAP_MODEL_CANDIDATES;
  if (candidateStrings.length === 0) return null;

  for (const candidateString of candidateStrings) {
    const parsed = parseModelCandidate(candidateString);
    if (!parsed) continue;

    const model = modelRegistry.find(parsed.provider, parsed.id);
    if (!model) continue;

    const auth = await modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) continue;

    return {
      provider: parsed.provider,
      id: parsed.id,
      model,
      apiKey: auth.apiKey,
      headers: auth.headers,
    };
  }

  return null;
}

type CompleteFn = (
  model: Model<Api>,
  context: Context,
  options?: ProviderStreamOptions,
) => Promise<AssistantMessage>;

export const DEFAULT_CHEAP_MODEL_SUMMARY_TIMEOUT_MS = 20_000;

const SUMMARIZE_SYSTEM_PROMPT =
  "You are a precise content summarizer for an AI coding assistant. " +
  "Extract and summarize only information relevant to the user's query. " +
  "Be concise. Include key facts, code snippets, and specific details relevant to the query. " +
  "If the content has nothing relevant to the query, say: No relevant content found.";

export async function summarizeContent(
  resolved: ResolvedModel,
  content: string,
  query: string,
  signal?: AbortSignal,
  completeFn: CompleteFn = complete,
  timeoutMs = DEFAULT_CHEAP_MODEL_SUMMARY_TIMEOUT_MS,
): Promise<string | null> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;

  try {
    const deadline = new Promise<never>((_, reject) => {
      const rejectOnce = (error: Error) => {
        if (!controller.signal.aborted) controller.abort(error);
        reject(error);
      };

      timeoutId = setTimeout(
        () => rejectOnce(new Error("cheap model summary timed out")),
        timeoutMs,
      );
      timeoutId.unref?.();

      if (signal?.aborted) {
        rejectOnce(new Error("cheap model summary aborted"));
        return;
      }

      abortHandler = () => rejectOnce(new Error("cheap model summary aborted"));
      signal?.addEventListener("abort", abortHandler, { once: true });
    });

    const result = await Promise.race([
      completeFn(
        resolved.model,
        {
          systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Query: ${query}\n\nPage content:\n${content}`,
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: resolved.apiKey,
          headers: resolved.headers,
          maxTokens: 2000,
          signal: controller.signal,
        },
      ),
      deadline,
    ]);

    if (result.stopReason === "error" || result.stopReason === "aborted") return null;

    const text = result.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n\n")
      .trim();

    if (!text) return null;

    return `[Content summarised by ${resolved.provider}/${resolved.id} — this is a summary, not verbatim page text]\n\n${text}`;
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (abortHandler) signal?.removeEventListener("abort", abortHandler);
  }
}
