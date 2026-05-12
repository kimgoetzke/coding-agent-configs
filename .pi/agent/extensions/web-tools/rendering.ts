/**
 * Pure rendering helpers for the web-tools extension.
 */

/**
 * Truncates a string to maxChars, appending a tail marker with the remaining
 * character count. Returns the string unchanged if it fits within the limit.
 */
export function truncateBody(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  const remaining = body.length - maxChars;
  return body.slice(0, maxChars) + `\n… [${remaining} more chars]`;
}

/**
 * Formats a byte count as a human-readable string (B / KB / MB).
 */
export function formatByteCount(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
