function errorMessage(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

export function collectSettledResults(settledResults, placeholders, { aborted = false } = {}) {
  return settledResults.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    const message = errorMessage(entry.reason);
    const childAborted = aborted || /abort/i.test(message);
    return {
      ...placeholders[index],
      status: childAborted ? "aborted" : "failed",
      exitCode: null,
      terminalReason: childAborted ? "aborted" : "worker_rejection",
      errorMessage: message,
    };
  });
}

export async function mapSettledWithConcurrencyLimit(items, concurrency, fn, { signal } = {}) {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      if (signal?.aborted) return;
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });

  await Promise.all(workers);
  if (signal?.aborted) {
    const reason = signal.reason instanceof Error ? signal.reason : new Error("Subagent was aborted");
    for (let index = 0; index < results.length; index++) {
      if (!results[index]) results[index] = { status: "rejected", reason };
    }
  }
  return results;
}
