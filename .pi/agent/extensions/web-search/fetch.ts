export const BYTE_LIMIT = 64 * 1024;

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0";

/**
 * Fetches a URL and returns the body, truncated to BYTE_LIMIT bytes.
 */
export async function fetchRaw(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; body: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: signal ?? AbortSignal.timeout(30_000),
    redirect: "follow",
  });
  const buffer = await response.arrayBuffer();
  const slice = buffer.byteLength > BYTE_LIMIT ? buffer.slice(0, BYTE_LIMIT) : buffer;
  const body = new TextDecoder().decode(slice);
  return { ok: response.ok, body };
}
