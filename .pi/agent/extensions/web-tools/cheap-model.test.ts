import test from "node:test";
import assert from "node:assert/strict";

import { parseModelCandidate, resolveCheapModel, summarizeContent, DEFAULT_CHEAP_MODEL_CANDIDATES } from "./cheap-model.ts";
import type { ResolvedModel } from "./cheap-model.ts";
import type { Api, Model } from "@earendil-works/pi-ai";

// --- parseModelCandidate ---

test("parseModelCandidate parses a valid provider/model-id string", () => {
  const result = parseModelCandidate("anthropic/claude-haiku-4-5-20251001");
  assert.deepEqual(result, { provider: "anthropic", id: "claude-haiku-4-5-20251001" });
});

test("parseModelCandidate handles model-id containing slashes (uses first slash as delimiter)", () => {
  const result = parseModelCandidate("openai/gpt-4/turbo");
  assert.deepEqual(result, { provider: "openai", id: "gpt-4/turbo" });
});

test("parseModelCandidate returns null for a string with no slash", () => {
  assert.equal(parseModelCandidate("noSlash"), null);
});

test("parseModelCandidate returns null for an empty string", () => {
  assert.equal(parseModelCandidate(""), null);
});

test("parseModelCandidate returns null when provider part is empty", () => {
  assert.equal(parseModelCandidate("/model-id"), null);
});

test("parseModelCandidate returns null when model-id part is empty", () => {
  assert.equal(parseModelCandidate("anthropic/"), null);
});

// --- DEFAULT_CHEAP_MODEL_CANDIDATES ---

test("DEFAULT_CHEAP_MODEL_CANDIDATES is a non-empty array of parseable strings", () => {
  assert.ok(DEFAULT_CHEAP_MODEL_CANDIDATES.length > 0);
  for (const candidate of DEFAULT_CHEAP_MODEL_CANDIDATES) {
    assert.ok(parseModelCandidate(candidate) !== null, `Unparseable candidate: ${candidate}`);
  }
});

// --- resolveCheapModel ---

function makeModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

function makeRegistry(
  available: Array<{ provider: string; id: string }>,
  authResults: Map<string, { ok: boolean; apiKey?: string }>
) {
  return {
    find(provider: string, modelId: string): Model<Api> | undefined {
      const entry = available.find(m => m.provider === provider && m.id === modelId);
      return entry ? makeModel(entry.provider, entry.id) : undefined;
    },
    async getApiKeyAndHeaders(model: Model<Api>) {
      const key = `${model.provider}/${model.id}`;
      const result = authResults.get(key);
      if (!result) return { ok: false as const, error: "not found" };
      if (result.ok) return { ok: true as const, apiKey: result.apiKey };
      return { ok: false as const, error: "no auth" };
    },
  };
}

test("resolveCheapModel returns first candidate with valid auth", async () => {
  const registry = makeRegistry(
    [{ provider: "anthropic", id: "claude-haiku-4-5-20251001" }],
    new Map([["anthropic/claude-haiku-4-5-20251001", { ok: true, apiKey: "test-key" }]])
  );
  const result = await resolveCheapModel(registry, {});
  assert.ok(result !== null);
  assert.equal(result.provider, "anthropic");
  assert.equal(result.id, "claude-haiku-4-5-20251001");
  assert.equal(result.apiKey, "test-key");
});

test("resolveCheapModel skips candidates not in the registry", async () => {
  const registry = makeRegistry(
    [{ provider: "google", id: "gemini-2.5-flash-lite" }],
    new Map([["google/gemini-2.5-flash-lite", { ok: true, apiKey: "google-key" }]])
  );
  const result = await resolveCheapModel(registry, {});
  assert.ok(result !== null);
  assert.equal(result.provider, "google");
  assert.equal(result.id, "gemini-2.5-flash-lite");
});

test("resolveCheapModel skips candidates with failed auth", async () => {
  const registry = makeRegistry(
    [
      { provider: "anthropic", id: "claude-haiku-4-5-20251001" },
      { provider: "google", id: "gemini-2.5-flash-lite" },
    ],
    new Map([
      ["anthropic/claude-haiku-4-5-20251001", { ok: false }],
      ["google/gemini-2.5-flash-lite", { ok: true, apiKey: "google-key" }],
    ])
  );
  const result = await resolveCheapModel(registry, {});
  assert.ok(result !== null);
  assert.equal(result.provider, "google");
});

test("resolveCheapModel returns null when all candidates fail auth", async () => {
  const registry = makeRegistry(
    [{ provider: "anthropic", id: "claude-haiku-4-5-20251001" }],
    new Map([["anthropic/claude-haiku-4-5-20251001", { ok: false }]])
  );
  const result = await resolveCheapModel(registry, {});
  assert.equal(result, null);
});

test("resolveCheapModel returns null when no candidates are in the registry", async () => {
  const registry = makeRegistry([], new Map());
  const result = await resolveCheapModel(registry, {});
  assert.equal(result, null);
});

test("resolveCheapModel uses user cheapModels override instead of defaults", async () => {
  const registry = makeRegistry(
    [{ provider: "custom", id: "my-model" }],
    new Map([["custom/my-model", { ok: true, apiKey: "custom-key" }]])
  );
  const result = await resolveCheapModel(registry, { cheapModels: ["custom/my-model"] });
  assert.ok(result !== null);
  assert.equal(result.provider, "custom");
  assert.equal(result.id, "my-model");
});

test("resolveCheapModel returns null when cheapModels is empty array (opt-out)", async () => {
  const registry = makeRegistry(
    [{ provider: "anthropic", id: "claude-haiku-4-5-20251001" }],
    new Map([["anthropic/claude-haiku-4-5-20251001", { ok: true, apiKey: "key" }]])
  );
  const result = await resolveCheapModel(registry, { cheapModels: [] });
  assert.equal(result, null);
});

test("resolveCheapModel skips unparseable entries in cheapModels", async () => {
  const registry = makeRegistry(
    [{ provider: "anthropic", id: "claude-haiku-4-5-20251001" }],
    new Map([["anthropic/claude-haiku-4-5-20251001", { ok: true, apiKey: "key" }]])
  );
  const result = await resolveCheapModel(registry, { cheapModels: ["not-valid", "anthropic/claude-haiku-4-5-20251001"] });
  assert.ok(result !== null);
  assert.equal(result.provider, "anthropic");
});

// --- summarizeContent ---

function makeResolvedModel(provider = "anthropic", id = "claude-haiku-4-5-20251001"): ResolvedModel {
  return {
    provider,
    id,
    model: makeModel(provider, id),
    apiKey: "test-key",
  };
}

function makeCompleteFn(response: { text?: string; stopReason?: string; throws?: Error }) {
  return async (_model: Model<Api>, _context: unknown, _options?: unknown) => {
    if (response.throws) throw response.throws;
    return {
      content: response.text ? [{ type: "text" as const, text: response.text }] : [],
      stopReason: (response.stopReason ?? "stop") as "stop" | "length" | "toolUse" | "error" | "aborted",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      timestamp: Date.now(),
      api: "anthropic-messages" as const,
    } as import("@earendil-works/pi-ai").AssistantMessage;
  };
}

test("summarizeContent returns formatted text with header on success", async () => {
  const completeFn = makeCompleteFn({ text: "This page explains X." });
  const result = await summarizeContent(makeResolvedModel(), "what is X", "Some long page content", undefined, completeFn);
  assert.ok(result !== null);
  assert.ok(result.startsWith("[Content summarised by anthropic/claude-haiku-4-5-20251001"));
  assert.ok(result.includes("this is a summary, not verbatim page text]"));
  assert.ok(result.includes("This page explains X."));
});

test("summarizeContent returns null when stopReason is error", async () => {
  const completeFn = makeCompleteFn({ stopReason: "error" });
  const result = await summarizeContent(makeResolvedModel(), "query", "content", undefined, completeFn);
  assert.equal(result, null);
});

test("summarizeContent returns null when stopReason is aborted", async () => {
  const completeFn = makeCompleteFn({ stopReason: "aborted" });
  const result = await summarizeContent(makeResolvedModel(), "query", "content", undefined, completeFn);
  assert.equal(result, null);
});

test("summarizeContent returns null when completeFn throws", async () => {
  const completeFn = makeCompleteFn({ throws: new Error("network failure") });
  const result = await summarizeContent(makeResolvedModel(), "query", "content", undefined, completeFn);
  assert.equal(result, null);
});

test("summarizeContent returns null when summarisation times out", async () => {
  const completeFn = async () => new Promise<never>(() => {});
  const startedAt = Date.now();

  const result = await summarizeContent(makeResolvedModel(), "query", "content", undefined, completeFn, 20);

  assert.equal(result, null);
  assert.ok(Date.now() - startedAt < 500);
});

test("summarizeContent returns null when response contains no text blocks", async () => {
  const completeFn = makeCompleteFn({ text: undefined });
  const result = await summarizeContent(makeResolvedModel(), "query", "content", undefined, completeFn);
  assert.equal(result, null);
});
