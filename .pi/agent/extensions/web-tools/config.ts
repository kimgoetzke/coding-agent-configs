import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  parseForceVerbatimContentFetchRules,
  type ForceVerbatimContentFetchRule,
} from "./fetch-content-mode.ts";

export type Provider = "duckduckgo" | "bing" | "searxng" | "wikipedia";

export interface WebSearchConfig {
  searxngUrl?: string;
  defaultMaxTokens?: number;
  providers?: Provider[];
  cheapModels?: string[];
  jsRendering?: boolean;
  forceVerbatimContentFetch?: ForceVerbatimContentFetchRule[];
}

const VALID_PROVIDERS = new Set<string>(["duckduckgo", "bing", "searxng", "wikipedia"]);

export function loadConfig(configPath?: string): { config: WebSearchConfig; warning?: string } {
  const path = configPath ?? join(homedir(), ".pi", "agent", "web-tools.json");

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { config: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { config: {}, warning: `web-tools: config at ${path} is not valid JSON — using defaults` };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { config: {}, warning: `web-tools: config at ${path} must be a JSON object — using defaults` };
  }

  const obj = parsed as Record<string, unknown>;
  const config: WebSearchConfig = {};

  if (typeof obj.searxngUrl === "string") config.searxngUrl = obj.searxngUrl;
  if (typeof obj.defaultMaxTokens === "number") config.defaultMaxTokens = obj.defaultMaxTokens;

  if (Array.isArray(obj.providers) && obj.providers.every(p => typeof p === "string" && VALID_PROVIDERS.has(p))) {
    config.providers = obj.providers as Provider[];
  }

  if (Array.isArray(obj.cheapModels) && obj.cheapModels.every(m => typeof m === "string")) {
    config.cheapModels = obj.cheapModels as string[];
  }

  if (typeof obj.jsRendering === "boolean") config.jsRendering = obj.jsRendering;

  const forceVerbatimContentFetch = parseForceVerbatimContentFetchRules(
    obj.forceVerbatimContentFetch,
  );
  if (forceVerbatimContentFetch !== undefined) {
    config.forceVerbatimContentFetch = forceVerbatimContentFetch;
  }

  return { config };
}
