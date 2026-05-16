import type { FooterStats, FooterThemeLike } from "./types.ts";

/** Powerline branch icon (U+E0A0) */
export const BRANCH_ICON = "";
export const SEPARATOR_ICON = "─";

function fg(theme: FooterThemeLike, token: string, text: string): string {
  return typeof theme.fg === "function" ? theme.fg(token, text) : text;
}

/**
 * Format a token count as a human-readable string.
 * Mirrors the built-in footer's formatTokens logic.
 */
export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

/**
 * Remove control characters from status text for single-line display.
 */
export function sanitize(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * Truncate plain (ANSI-free) text to maxWidth columns, appending "…" if needed.
 */
export function truncatePlain(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return "…";
  return `${text.slice(0, maxWidth - 1)}…`;
}

/**
 * Select the theme colour token for the context-usage percentage.
 *  null     → success
 *   < 40 %  → muted
 *  40–59 %  → warning
 *  ≥ 60 %   → error
 */
export function selectContextToken(percent: number | null): string {
  if (percent == null) return "success";
  if (percent >= 60) return "error";
  if (percent >= 40) return "warning";
  return "muted";
}

const THINKING_TOKENS: Record<string, string> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
};

/**
 * Return the theme colour token for a given thinking level.
 * Falls back to "muted" for unrecognised values.
 */
export function thinkingToken(level: string | undefined): string {
  if (!level) return "muted";
  return THINKING_TOKENS[level] ?? "muted";
}

/**
 * Build the plain-text context display string, e.g. "7.4%/264k".
 */
export function buildContextDisplay(percent: number | null, contextWindow: number): string {
  const windowStr = formatTokens(contextWindow);
  if (percent == null) return `?/${windowStr}`;
  return `${percent.toFixed(1)}%/${windowStr}`;
}

export function renderSeparatorLine(width: number, theme: FooterThemeLike): string {
  return fg(theme, "accent", SEPARATOR_ICON.repeat(Math.max(0, width)));
}

/**
 * Build the pwd row.
 *
 * Format: <path accent>  <icon syntaxVariable><branch syntaxVariable>
 * The session name is intentionally omitted because the conversation-statusline
 * extension already shows it in the editor chrome's top border.
 */
export function renderPwdLine(
  width: number,
  theme: FooterThemeLike,
  cwd: string,
  branch: string | null,
  home: string,
): string {
  let pwd = cwd;
  if (home && pwd.startsWith(home)) {
    pwd = `~${pwd.slice(home.length)}`;
  }

  if (!branch) {
    return fg(theme, "accent", truncatePlain(pwd, width));
  }

  const suffixPlain = ` ${BRANCH_ICON} ${branch}`;
  const maxPwdWidth = Math.max(0, width - suffixPlain.length);
  const pwdTruncated = truncatePlain(pwd, maxPwdWidth);
  const branchTruncated = truncatePlain(branch, Math.max(0, width - ` ${BRANCH_ICON} `.length));

  if (pwdTruncated.length + suffixPlain.length > width) {
    return fg(theme, "syntaxVariable", ` ${BRANCH_ICON} ${branchTruncated}`);
  }

  return fg(theme, "accent", pwdTruncated) + fg(theme, "syntaxVariable", ` ${BRANCH_ICON} ${branch}`);
}

/**
 * Build the stats row.
 */
export function renderStatsLine(width: number, theme: FooterThemeLike, stats: FooterStats): string {
  const {
    totals,
    contextWindow,
    contextPercent,
    modelId,
    provider,
    multiProvider,
    usingSubscription,
    reasoning,
    thinkingLevel,
  } = stats;
  const contextDisplay = buildContextDisplay(contextPercent, contextWindow);
  const contextToken = selectContextToken(contextPercent);

  const segments: Array<[string, string]> = [];
  if (totals.input > 0) segments.push([`↑${formatTokens(totals.input)}`, "syntaxNumber"]);
  if (totals.output > 0) segments.push([`↓${formatTokens(totals.output)}`, "success"]);
  if (totals.cacheRead > 0) segments.push([`R${formatTokens(totals.cacheRead)}`, "muted"]);
  if (totals.cacheWrite > 0) segments.push([`W${formatTokens(totals.cacheWrite)}`, "muted"]);
  if (totals.cost > 0 || usingSubscription) {
    segments.push([`$${totals.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`, "muted"]);
  }
  segments.push([contextDisplay, contextToken]);

  const leftPlain = segments.map(([text]) => text).join(" ");
  const leftWidth = leftPlain.length;

  let thinkingMuted = "";
  let thinkingValue = "";
  let thinkingColourToken = "muted";
  if (reasoning) {
    const level = thinkingLevel ?? "off";
    thinkingColourToken = thinkingToken(level);
    thinkingMuted = " • ";
    thinkingValue = level === "off" ? "thinking off" : level;
  }
  const thinkingSuffix = `${thinkingMuted}${thinkingValue}`;

  let providerPrefix = "";
  if (multiProvider && provider) {
    const candidate = `(${provider}) `;
    if (leftWidth + 2 + candidate.length + modelId.length + thinkingSuffix.length <= width) {
      providerPrefix = candidate;
    }
  }

  const rightPlain = `${providerPrefix}${modelId}${thinkingSuffix}`;
  const rightWidth = rightPlain.length;

  const leftColoured = segments.map(([text, token]) => fg(theme, token, text)).join(" ");
  const rightColoured =
    (providerPrefix ? fg(theme, "muted", providerPrefix) : "") +
    fg(theme, "warning", modelId) +
    (thinkingMuted ? fg(theme, "muted", thinkingMuted) : "") +
    (thinkingValue ? fg(theme, thinkingColourToken, thinkingValue) : "");

  const minPadding = 2;
  if (leftWidth + minPadding + rightWidth <= width) {
    const padding = " ".repeat(width - leftWidth - rightWidth);
    return leftColoured + padding + rightColoured;
  }

  const available = width - leftWidth - minPadding;
  if (available > 0) {
    const truncatedRight = truncatePlain(rightPlain, available);
    const padding = " ".repeat(width - leftWidth - truncatedRight.length);
    return leftColoured + padding + fg(theme, "accent", truncatedRight);
  }

  return leftColoured;
}

export function renderExtensionStatusesLine(
  width: number,
  extensionStatuses: ReadonlyMap<string, string> | Iterable<[string, string]>,
): string | undefined {
  const statusLine = Array.from(extensionStatuses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => sanitize(text))
    .join(" ");

  return statusLine ? truncatePlain(statusLine, width) : undefined;
}
