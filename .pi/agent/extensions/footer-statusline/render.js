/** Powerline branch icon (U+E0A0) */
export const BRANCH_ICON = "";

/**
 * Format a token count as a human-readable string.
 * Mirrors the built-in footer's formatTokens logic.
 */
export function formatTokens(count) {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

/**
 * Remove control characters from status text for single-line display.
 */
export function sanitize(text) {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * Truncate plain (ANSI-free) text to maxWidth columns, appending "…" if needed.
 */
export function truncatePlain(text, maxWidth) {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return "…";
  return `${text.slice(0, maxWidth - 1)}…`;
}

/**
 * Select the theme colour token for the context-usage percentage.
 *   < 40 %  → muted  (comfortable)
 *  40–59 %  → warning
 *  ≥ 60 %   → error
 * When the percentage is unknown (null) treat it as comfortable.
 */
export function selectContextToken(percent) {
  if (percent == null) return "success";
  if (percent >= 60) return "error";
  if (percent >= 40) return "warning";
  return "muted";
}

/**
 * Build the plain-text context display string, e.g. "7.4%/264k".
 * @param {number | null} percent  – context percentage, or null if unknown
 * @param {number}        contextWindow – context window size in tokens
 */
export function buildContextDisplay(percent, contextWindow) {
  const windowStr = formatTokens(contextWindow);
  if (percent == null) return `?/${windowStr}`;
  return `${percent.toFixed(1)}%/${windowStr}`;
}
