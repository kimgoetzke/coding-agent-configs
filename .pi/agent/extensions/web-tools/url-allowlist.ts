/** Module-level allow-list, cleared on each fresh session. */
const allowedUrls = new Set<string>();

/**
 * Normalises a URL for consistent comparison:
 * - strips fragment
 * - strips default ports (80 for http, 443 for https)
 * - strips trailing slash from non-root paths
 */
export function normaliseUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const URL_REGEX = /https?:\/\/[^\s"'<>)]+/g;

/**
 * Extracts all URLs from a text string (plain text or HTML) using a regex.
 * Strips trailing sentence punctuation (.,;:!?) that is not part of the URL.
 */
export function extractUrls(text: string): string[] {
  const matches = (text.match(URL_REGEX) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ""));
  return [...new Set(matches.map(normaliseUrl))];
}

/** Adds a single URL (normalised) to the allow-list. */
export function addUrl(url: string): void {
  allowedUrls.add(normaliseUrl(url));
}

/** Adds multiple URLs (each normalised) to the allow-list. */
export function addUrls(urls: string[]): void {
  for (const url of urls) {
    allowedUrls.add(normaliseUrl(url));
  }
}

/**
 * Extracts all URLs from a text string and adds them to the allow-list.
 * Used both for seeding from user messages and from web_search HTML bodies.
 */
export function addUrlsFromText(text: string): void {
  addUrls(extractUrls(text));
}

/** Returns true when the (normalised) URL is in the allow-list. */
export function isAllowed(url: string): boolean {
  return allowedUrls.has(normaliseUrl(url));
}

/** Clears the allow-list. Called on each fresh session start. */
export function clear(): void {
  allowedUrls.clear();
}

/** Returns the current allow-list as a sorted array, for use in error messages. */
export function getAllowed(): string[] {
  return [...allowedUrls].sort();
}
