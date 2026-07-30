const TERMINAL_STATUSES = new Set(["settled", "failed", "aborted"]);

export function isTerminalResult(result) {
  if (result.status) return TERMINAL_STATUSES.has(result.status);
  return typeof result.exitCode === "number" && result.exitCode !== -1;
}

export function countResultStatuses(results) {
  const counts = {
    queued: 0,
    running: 0,
    outputReceived: 0,
    succeeded: 0,
    failed: 0,
    aborted: 0,
    done: 0,
    active: 0,
  };

  for (const result of results) {
    if (result.status === "queued") counts.queued++;
    else if (result.status === "running") counts.running++;
    else if (result.status === "output_received") counts.outputReceived++;
    else if (result.status === "settled") counts.succeeded++;
    else if (result.status === "failed") counts.failed++;
    else if (result.status === "aborted") counts.aborted++;
    else if (!isTerminalResult(result)) counts.running++;
    else if (result.stopReason === "aborted") counts.aborted++;
    else if (isFailedResult(result)) counts.failed++;
    else counts.succeeded++;
  }
  counts.done = counts.succeeded + counts.failed + counts.aborted;
  counts.active = counts.queued + counts.running + counts.outputReceived;
  return counts;
}

export function isFailedResult(result) {
  if (result.status) return result.status === "failed" || result.status === "aborted";
  if (result.stopReason === "error" || result.stopReason === "aborted") return true;
  return typeof result.exitCode === "number" && result.exitCode !== -1 && result.exitCode !== 0;
}

export function getResultOutput(result, finalOutput) {
  if (isFailedResult(result)) {
    return result.errorMessage || result.stderr || finalOutput || "(no output)";
  }
  return finalOutput || "(no output)";
}

const PER_TASK_OUTPUT_CAP = 50 * 1024;

export function truncateParallelOutput(output) {
  const byteLength = Buffer.byteLength(output, "utf8");
  if (byteLength <= PER_TASK_OUTPUT_CAP) return output;

  let truncated = output.slice(0, PER_TASK_OUTPUT_CAP);
  while (Buffer.byteLength(truncated, "utf8") > PER_TASK_OUTPUT_CAP) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}\n\n[Output truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted. Full output preserved in tool details.]`;
}
