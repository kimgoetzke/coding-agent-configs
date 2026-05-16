export const FETCH_CONTENT_MODE_VALUES = ["auto", "verbatim", "summary"] as const;

export type FetchContentMode = (typeof FETCH_CONTENT_MODE_VALUES)[number];
export type AppliedFetchContentMode = Exclude<FetchContentMode, "auto">;

export interface ForceVerbatimContentFetchRule {
  host?: string;
  subdomain?: string;
  pathPrefix?: string;
}

export interface FetchContentModeDecision {
  requestedMode: FetchContentMode;
  effectiveMode: AppliedFetchContentMode;
  reason: string;
}

interface InternalRule extends ForceVerbatimContentFetchRule {
  source: "built-in" | "config";
}

interface ExtractedContentShape {
  content: string;
  truncated: boolean;
}

export interface FetchContentOutputSelection {
  agentContent: string;
  detailsContent: string;
  returnedMode: AppliedFetchContentMode;
}

export const DEFAULT_FORCE_VERBATIM_CONTENT_FETCH_RULES: ForceVerbatimContentFetchRule[] = [
  { host: "pi.dev" },
  { host: "github.com" },
  { host: "raw.githubusercontent.com" },
  { host: "gist.github.com" },
  { host: "gitlab.com" },
  { host: "bitbucket.org" },
  { host: "codeberg.org" },
  { host: "sr.ht" },
  { host: "sourceforge.net" },
  { host: "dev.azure.com" },
  { subdomain: "docs" },
  { subdomain: "api" },
  { subdomain: "reference" },
  { subdomain: "developer" },
  { subdomain: "developers" },
  { subdomain: "learn" },
  { pathPrefix: "/docs/" },
  { pathPrefix: "/reference/" },
  { pathPrefix: "/api/" },
  { pathPrefix: "/sdk/" },
  { pathPrefix: "/manual/" },
  { pathPrefix: "/raw/" },
];

function cleanString(value: unknown, lowerCase = false): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return lowerCase ? trimmed.toLowerCase() : trimmed;
}

export function parseForceVerbatimContentFetchRules(
  raw: unknown,
): ForceVerbatimContentFetchRule[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const rules = raw.flatMap((candidate): ForceVerbatimContentFetchRule[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const obj = candidate as Record<string, unknown>;
    const rule: ForceVerbatimContentFetchRule = {};

    const host = cleanString(obj.host, true);
    const subdomain = cleanString(obj.subdomain, true);
    const pathPrefix = cleanString(obj.pathPrefix);

    if (host) rule.host = host;
    if (subdomain) rule.subdomain = subdomain;
    if (pathPrefix) rule.pathPrefix = pathPrefix;

    return rule.host || rule.subdomain || rule.pathPrefix ? [rule] : [];
  });

  return rules;
}

function matchesSubdomain(hostname: string, subdomain: string): boolean {
  return hostname.startsWith(`${subdomain}.`);
}

function matchesRule(parsedUrl: URL, rule: ForceVerbatimContentFetchRule): boolean {
  const hostname = parsedUrl.hostname.toLowerCase();

  if (rule.host && hostname !== rule.host) return false;
  if (rule.subdomain && !matchesSubdomain(hostname, rule.subdomain)) return false;
  if (rule.pathPrefix && !parsedUrl.pathname.startsWith(rule.pathPrefix)) return false;

  return true;
}

function describeMatchedRule(rule: InternalRule): string {
  if (rule.host) return `${rule.source} host ${rule.host}`;
  if (rule.subdomain) return `${rule.source} subdomain ${rule.subdomain}`;
  return `${rule.source} pathPrefix ${rule.pathPrefix}`;
}

function withSource(
  source: InternalRule["source"],
  rules: ForceVerbatimContentFetchRule[],
): InternalRule[] {
  return rules.map((rule) => ({ ...rule, source }));
}

export function resolveFetchContentMode(
  url: string,
  requestedMode: FetchContentMode = "auto",
  configRules: ForceVerbatimContentFetchRule[] = [],
): FetchContentModeDecision {
  if (requestedMode === "verbatim") {
    return { requestedMode, effectiveMode: "verbatim", reason: "explicit mode=verbatim" };
  }

  if (requestedMode === "summary") {
    return { requestedMode, effectiveMode: "summary", reason: "explicit mode=summary" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { requestedMode, effectiveMode: "summary", reason: "auto fallback to summary" };
  }

  const builtInRules = withSource("built-in", DEFAULT_FORCE_VERBATIM_CONTENT_FETCH_RULES);
  const configuredRules = withSource("config", configRules);
  const allRules = [...builtInRules, ...configuredRules];
  const matchGroups: Array<keyof ForceVerbatimContentFetchRule> = ["host", "subdomain", "pathPrefix"];

  for (const key of matchGroups) {
    const matchedRule = allRules.find((rule) => rule[key] && matchesRule(parsedUrl, rule));
    if (matchedRule) {
      return {
        requestedMode,
        effectiveMode: "verbatim",
        reason: `auto matched ${describeMatchedRule(matchedRule)}`,
      };
    }
  }

  return { requestedMode, effectiveMode: "summary", reason: "auto fallback to summary" };
}

export function chooseFetchContentOutput(
  decision: FetchContentModeDecision,
  extracted: ExtractedContentShape,
  summaryText: string | null,
  maxTokens: number,
): FetchContentOutputSelection {
  const truncationNote = extracted.truncated
    ? `\n\n[Content truncated to ~${maxTokens} tokens]`
    : "";

  if (decision.effectiveMode === "summary" && summaryText !== null) {
    return {
      agentContent: summaryText,
      detailsContent: summaryText,
      returnedMode: "summary",
    };
  }

  return {
    agentContent: extracted.content + truncationNote,
    detailsContent: extracted.content,
    returnedMode: "verbatim",
  };
}
