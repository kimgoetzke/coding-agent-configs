/**
 * Prompt-filtered fetch — Phase 2.
 *
 * Filters markdown content to only paragraphs relevant to a query, using
 * word-overlap scoring. Designed for use inside fetch_content to narrow the
 * context window to query-relevant sections before applying the token budget.
 *
 * No external dependencies — pure string processing.
 */

// ── Stopwords ─────────────────────────────────────────────────────────────────

export const STOPWORDS: Set<string> = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "can", "shall", "this", "that", "these", "those", "it", "its", "what",
  "which", "who", "whom", "how", "when", "where", "why", "i", "you", "he",
  "she", "we", "they", "me", "him", "her", "us", "them", "my", "your",
  "his", "our", "their", "not", "no", "so", "if", "as", "then", "than",
  "also", "just", "more", "some", "any", "all", "very", "here", "there",
]);

// ── Tokenisation ──────────────────────────────────────────────────────────────

export function tokeniseQuery(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));

  // Deduplicate while preserving first-occurrence order.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word);
      result.push(word);
    }
  }
  return result;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreQueryParagraph(paragraph: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0.0;
  const lower = paragraph.toLowerCase();
  const matched = queryTokens.filter((token) => lower.includes(token));
  return matched.length / queryTokens.length;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

const RELEVANCE_THRESHOLD = 0.1;

export function filterByRelevance(
  markdown: string,
  queryTokens: string[],
  threshold = RELEVANCE_THRESHOLD,
): string {
  if (queryTokens.length === 0) return markdown;

  // Split into blocks separated by blank lines.
  const blocks = markdown.split(/\n\n+/);
  const isHeading = (block: string) => /^#{1,6}\s/.test(block.trimStart());

  const kept: string[] = [];
  let pendingHeadings: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (isHeading(trimmed)) {
      pendingHeadings.push(trimmed);
      continue;
    }

    const score = scoreQueryParagraph(trimmed, queryTokens);
    if (score >= threshold) {
      kept.push(...pendingHeadings, trimmed);
      pendingHeadings = [];
    } else {
      pendingHeadings = [];
    }
  }

  if (kept.length === 0) return markdown;
  return kept.join("\n\n");
}

// ── Public convenience wrapper ────────────────────────────────────────────────

export function applyPromptFilter(markdown: string, query: string): string {
  const tokens = tokeniseQuery(query);
  return filterByRelevance(markdown, tokens);
}
