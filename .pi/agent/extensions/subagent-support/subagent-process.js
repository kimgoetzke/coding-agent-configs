import { spawn } from "node:child_process";

const DEFAULT_TERMINATION_GRACE_MS = 1000;

function killProcessTree(proc, signal) {
  if (!proc.pid || proc.exitCode !== null || proc.signalCode !== null) return;

  if (process.platform === "win32") {
    const taskkill = spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    taskkill.unref();
    return;
  }

  try {
    process.kill(-proc.pid, signal);
  } catch {
    proc.kill(signal);
  }
}

/**
 * Consume a Pi JSON subprocess until it exits or reports agent_settled.
 * agent_settled is terminal even when another loaded extension keeps the child event loop alive.
 */
export function waitForSubagentProcess(
  proc,
  { onEvent, signal, terminationGraceMs = DEFAULT_TERMINATION_GRACE_MS } = {},
) {
  return new Promise((resolve) => {
    let buffer = "";
    let stderr = "";
    let settled = false;
    let aborted = false;
    let finished = false;
    let terminationTimer;

    const processLine = (line) => {
      if (!line.trim()) return;

      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      onEvent?.(event);
      if (event.type === "agent_settled" && !settled) {
        settled = true;
        terminate();
      }
    };

    const flushBuffer = () => {
      if (buffer.trim()) processLine(buffer);
      buffer = "";
    };

    const terminate = () => {
      if (proc.exitCode !== null || proc.signalCode !== null) return;

      killProcessTree(proc, "SIGTERM");
      terminationTimer = setTimeout(() => {
        killProcessTree(proc, "SIGKILL");
      }, terminationGraceMs);
      terminationTimer.unref?.();
    };

    const finish = (code) => {
      if (finished) return;
      finished = true;
      if (terminationTimer) clearTimeout(terminationTimer);
      signal?.removeEventListener("abort", abort);
      flushBuffer();
      resolve({
        exitCode: settled ? 0 : (code ?? 0),
        stderr,
        settled,
        aborted,
      });
    };

    const abort = () => {
      aborted = true;
      terminate();
    };

    proc.stdout?.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("exit", finish);
    proc.on("close", finish);
    proc.on("error", () => finish(1));

    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
