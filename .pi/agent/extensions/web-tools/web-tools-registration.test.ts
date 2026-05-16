import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

type ExtractedResult = {
  url: string;
  title: string | null;
  content: string;
  contentTokensApprox: number;
  truncated: boolean;
  statusCode?: number;
  source: "html" | "text" | "github-api" | "github-clone" | "browser-html";
  rawHtml?: string;
};

type TestState = {
  config: Record<string, unknown>;
  allowed: Set<string>;
  extractResult: ExtractedResult;
  extractCalls: Array<{ url: string; maxTokens: number; query: string | undefined }>;
  browserResult: ExtractedResult | null;
  browserCalls: Array<{ url: string; maxTokens: number; query: string | undefined }>;
  parseGitHubResult: unknown;
  githubResult: ExtractedResult | null;
  githubCalls: Array<{ descriptor: unknown; maxTokens: number }>;
  prewarmCalls: number;
  closeCalls: number;
  resolvedCheapModel: { provider: string; id: string } | null;
  resolveCheapModelCalls: number;
  summaryText: string | null;
  summarizeCalls: Array<{ resolved: unknown; content: string; query: string }>;
};

function makeExtractedResult(overrides: Partial<ExtractedResult> = {}): ExtractedResult {
  return {
    url: "https://example.com/page",
    title: "Example Page",
    content: "Extracted page content",
    contentTokensApprox: 5,
    truncated: false,
    source: "html",
    ...overrides,
  };
}

function resetState(overrides: Partial<TestState> = {}): TestState {
  const state: TestState = {
    config: {},
    allowed: new Set<string>(),
    extractResult: makeExtractedResult(),
    extractCalls: [],
    browserResult: null,
    browserCalls: [],
    parseGitHubResult: null,
    githubResult: null,
    githubCalls: [],
    prewarmCalls: 0,
    closeCalls: 0,
    resolvedCheapModel: null,
    resolveCheapModelCalls: 0,
    summaryText: null,
    summarizeCalls: [],
    ...overrides,
  };
  (globalThis as typeof globalThis & { __WEB_TOOLS_TEST_STATE?: TestState }).__WEB_TOOLS_TEST_STATE =
    state;
  return state;
}

function getState(): TestState {
  const state = (globalThis as typeof globalThis & { __WEB_TOOLS_TEST_STATE?: TestState })
    .__WEB_TOOLS_TEST_STATE;
  assert.ok(state, "test state must be initialised");
  return state;
}

const stubSources = new Map<string, string>([
  [
    "web-tools-test:@mariozechner/pi-tui",
    `
      export class Container {
        children = [];
        addChild(child) { this.children.push(child); }
      }
      export class Spacer {
        constructor(size) { this.size = size; }
      }
      export class Text {
        constructor(text, x = 0, y = 0) {
          this.text = text;
          this.x = x;
          this.y = y;
        }
      }
    `,
  ],
  [
    "web-tools-test:@sinclair/typebox",
    `
      export const Type = {
        Object(properties, options = {}) { return { type: "object", properties, ...options }; },
        String(options = {}) { return { type: "string", ...options }; },
        Number(options = {}) { return { type: "number", ...options }; },
        Optional(schema) { return { ...schema, optional: true }; },
        Union(anyOf, options = {}) { return { anyOf, ...options }; },
        Literal(value, options = {}) { return { const: value, type: typeof value, ...options }; },
      };
    `,
  ],
  [
    "web-tools-test:./browser-fetcher.js",
    `
      function state() { return globalThis.__WEB_TOOLS_TEST_STATE; }
      export async function closeBrowserSession() { state().closeCalls += 1; }
      export function prewarmBrowserSession() { state().prewarmCalls += 1; }
      export async function fetchWithBrowser(url, maxTokens, _signal, query) {
        state().browserCalls.push({ url, maxTokens, query });
        return state().browserResult ?? state().extractResult;
      }
    `,
  ],
  [
    "web-tools-test:./concurrency.js",
    `
      export class ConcurrencyLimiter {
        constructor(maxConcurrent) { this.maxConcurrent = maxConcurrent; }
        async run(operation) { return await operation(); }
      }
    `,
  ],
  [
    "web-tools-test:./config.js",
    `
      function state() { return globalThis.__WEB_TOOLS_TEST_STATE; }
      export function loadConfig() { return { config: state().config }; }
    `,
  ],
  [
    "web-tools-test:./content-extractor.js",
    `
      function state() { return globalThis.__WEB_TOOLS_TEST_STATE; }
      export const DEFAULT_MAX_TOKENS = 8000;
      export const MAX_TOKENS_CAP = 16000;
      export function isLikelyJSRendered() { return false; }
      export async function extractContent(url, maxTokens, _signal, query) {
        state().extractCalls.push({ url, maxTokens, query });
        return { ...state().extractResult, url };
      }
    `,
  ],
  [
    "web-tools-test:./github-router.js",
    `
      function state() { return globalThis.__WEB_TOOLS_TEST_STATE; }
      export function clearCloneCache() {}
      export function parseGitHubUrl() { return state().parseGitHubResult; }
      export async function fetchGitHubContent(descriptor, maxTokens) {
        state().githubCalls.push({ descriptor, maxTokens });
        return state().githubResult ?? state().extractResult;
      }
    `,
  ],
  [
    "web-tools-test:./rendering.js",
    `
      export function truncateBody(body, maxLength) {
        return body.length > maxLength ? body.slice(0, maxLength) : body;
      }
    `,
  ],
  [
    "web-tools-test:./search-providers.js",
    `
      export async function search(query, maxResults) {
        return {
          results: [],
          provider: "mock",
          searchUrl: "https://search.example/?q=" + encodeURIComponent(query),
          attempts: [{ name: "mock", outcome: "success", resultCount: maxResults }],
        };
      }
    `,
  ],
  [
    "web-tools-test:./url-allowlist.js",
    `
      function state() { return globalThis.__WEB_TOOLS_TEST_STATE; }
      function extractUrls(text) {
        return text.match(/https?:\\/\\/[^\\s)"]+/g) ?? [];
      }
      export function addUrls(urls) {
        for (const url of urls) state().allowed.add(url);
      }
      export function addUrlsFromText(text) {
        for (const url of extractUrls(text)) state().allowed.add(url);
      }
      export function clear() { state().allowed.clear(); }
      export function getAllowed() { return [...state().allowed]; }
      export function isAllowed(url) { return state().allowed.has(url); }
    `,
  ],
  [
    "web-tools-test:./cheap-model.js",
    `
      function state() { return globalThis.__WEB_TOOLS_TEST_STATE; }
      export async function resolveCheapModel() {
        state().resolveCheapModelCalls += 1;
        return state().resolvedCheapModel;
      }
      export async function summarizeContent(resolved, content, query) {
        state().summarizeCalls.push({ resolved, content, query });
        return state().summaryText;
      }
    `,
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@mariozechner/pi-tui") {
      return { shortCircuit: true, url: "web-tools-test:@mariozechner/pi-tui" };
    }
    if (specifier === "@sinclair/typebox") {
      return { shortCircuit: true, url: "web-tools-test:@sinclair/typebox" };
    }
    if (stubSources.has(`web-tools-test:${specifier}`)) {
      return { shortCircuit: true, url: `web-tools-test:${specifier}` };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const source = stubSources.get(url);
    if (source !== undefined) {
      return { format: "module", shortCircuit: true, source };
    }
    return nextLoad(url, context);
  },
});

const { default: registerWebTools } = await import(new URL("./web-tools.ts", import.meta.url).href);

type RegisteredTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }>;
};

function createPiHarness() {
  const tools = new Map<string, RegisteredTool>();
  const handlers = new Map<string, Array<(event: Record<string, unknown>) => unknown>>();

  return {
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
    on(name: string, handler: (event: Record<string, unknown>) => unknown) {
      const existing = handlers.get(name) ?? [];
      existing.push(handler);
      handlers.set(name, existing);
    },
    getTool(name: string): RegisteredTool {
      const tool = tools.get(name);
      assert.ok(tool, `tool ${name} should be registered`);
      return tool;
    },
    async emit(name: string, event: Record<string, unknown>) {
      for (const handler of handlers.get(name) ?? []) {
        await handler(event);
      }
    },
    get toolNames(): string[] {
      return [...tools.keys()].sort();
    },
  };
}

function makeContext() {
  return {
    model: { provider: "openai", id: "gpt-5" },
    modelRegistry: {},
  };
}

test.beforeEach(() => {
  resetState();
});

test("web-tools registers fetch_content with the public mode parameter", () => {
  const pi = createPiHarness();
  registerWebTools(pi as never);

  assert.deepEqual(pi.toolNames, ["fetch_content", "web_search"]);

  const fetchContent = pi.getTool("fetch_content");
  assert.match(fetchContent.description, /verbatim extracted content or a cheap-model summary/);

  const parameters = fetchContent.parameters as { properties: Record<string, { anyOf?: Array<{ const: string }> }> };
  assert.ok(parameters.properties.mode, "mode parameter should be registered");
  assert.deepEqual(
    parameters.properties.mode.anyOf?.map((entry) => entry.const),
    ["auto", "verbatim", "summary"],
  );
});

test("fetch_content auto mode returns verbatim content for docs-like URLs without resolving a summary model", async () => {
  const url = "https://docs.example.com/docs/getting-started";
  const state = resetState({
    extractResult: makeExtractedResult({ url, content: "Verbatim docs content" }),
    resolvedCheapModel: { provider: "mock", id: "mini" },
    summaryText: "Summary that should not be used",
  });

  const pi = createPiHarness();
  registerWebTools(pi as never);
  await pi.emit("before_agent_start", { prompt: `Fetch ${url}` });

  const result = await pi.getTool("fetch_content").execute(
    "tool-call-1",
    { url },
    undefined,
    undefined,
    makeContext(),
  );

  assert.equal(result.content[0]?.text, "Verbatim docs content");
  assert.equal(result.details?.responseMode, "verbatim");
  assert.equal(result.details?.queryFilter, null);
  assert.match(String(result.details?.modeReason), /built-in subdomain docs/);
  assert.equal(result.details?.cheapModel, "n/a - verbatim mode");
  assert.equal(state.resolveCheapModelCalls, 0);
  assert.equal(state.summarizeCalls.length, 0);
  assert.deepEqual(state.extractCalls, [{ url, maxTokens: 16000, query: undefined }]);
});

test("fetch_content summary mode returns cheap-model output through the registered tool", async () => {
  const url = "https://example.com/blog/post";
  const prompt = `Summarise ${url} for deployment changes`;
  const state = resetState({
    extractResult: makeExtractedResult({ url, content: "Long extracted article" }),
    resolvedCheapModel: { provider: "mock", id: "mini" },
    summaryText: "Summarised deployment changes",
  });

  const pi = createPiHarness();
  registerWebTools(pi as never);
  await pi.emit("before_agent_start", { prompt });

  const result = await pi.getTool("fetch_content").execute(
    "tool-call-2",
    { url, mode: "summary" },
    undefined,
    undefined,
    makeContext(),
  );

  assert.equal(result.content[0]?.text, "Summarised deployment changes");
  assert.equal(result.details?.responseMode, "summary");
  assert.equal(result.details?.requestedMode, "summary");
  assert.equal(result.details?.queryFilter, prompt);
  assert.equal(result.details?.queryFilterSource, "prompt");
  assert.equal(result.details?.cheapModel, "mock/mini (active)");
  assert.equal(state.resolveCheapModelCalls, 1);
  assert.deepEqual(state.extractCalls, [{ url, maxTokens: 8000, query: undefined }]);
  assert.deepEqual(state.summarizeCalls, [
    {
      resolved: { provider: "mock", id: "mini" },
      content: "Long extracted article",
      query: prompt,
    },
  ]);
});

test("fetch_content summary mode falls back to verbatim extracted content when no cheap model is available", async () => {
  const url = "https://example.com/reference/page";
  const prompt = `Check ${url} for config keys`;
  const state = resetState({
    extractResult: makeExtractedResult({ url, content: "Filtered extracted reference text" }),
    resolvedCheapModel: null,
    summaryText: null,
  });

  const pi = createPiHarness();
  registerWebTools(pi as never);
  await pi.emit("before_agent_start", { prompt });

  const result = await pi.getTool("fetch_content").execute(
    "tool-call-3",
    { url, mode: "summary" },
    undefined,
    undefined,
    makeContext(),
  );

  assert.equal(result.content[0]?.text, "Filtered extracted reference text");
  assert.equal(result.details?.responseMode, "verbatim");
  assert.equal(result.details?.requestedMode, "summary");
  assert.equal(result.details?.queryFilter, prompt);
  assert.equal(result.details?.queryFilterSource, "prompt");
  assert.equal(result.details?.cheapModel, "n/a - verbatim mode");
  assert.equal(state.resolveCheapModelCalls, 1);
  assert.deepEqual(state.extractCalls, [{ url, maxTokens: 8000, query: prompt }]);
  assert.deepEqual(state.summarizeCalls, []);
});
