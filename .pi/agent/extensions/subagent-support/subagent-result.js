export function isFailedResult(result) {
  return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
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
