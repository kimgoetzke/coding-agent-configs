import { spawn } from "node:child_process";

const DEFAULT_TERMINATION_GRACE_MS = 1000;
const DEFAULT_POST_FINAL_DEADLINE_MS = 30_000;
const DEFAULT_CLEANUP_DEADLINE_MS = 5_000;
const DEFAULT_OVERALL_DEADLINE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_TASKKILL_TIMEOUT_MS = 2_000;

function errorMetadata(error) {
  if (!error) return undefined;
  return {
    name: error.name ?? "Error",
    message: error.message ?? String(error),
    ...(error.code === undefined ? {} : { code: String(error.code) }),
  };
}

function processHasExited(proc) {
  return proc.exitCode !== null || proc.signalCode !== null;
}

export function createProcessTreeTerminator({
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill,
  taskkillTimeoutMs = DEFAULT_TASKKILL_TIMEOUT_MS,
} = {}) {
  if (platform === "win32") {
    return (proc, { signal = "SIGKILL" } = {}) =>
      new Promise((resolve) => {
        const base = { platform, strategy: "taskkill", pid: proc.pid ?? null, signal };
        if (!proc.pid || processHasExited(proc)) {
          resolve({ ...base, status: "already_exited", exitCode: proc.exitCode ?? null, stderr: "" });
          return;
        }

        let helper;
        try {
          helper = spawnProcess("taskkill", ["/F", "/T", "/PID", String(proc.pid)], {
            stdio: ["ignore", "ignore", "pipe"],
            windowsHide: true,
          });
        } catch (error) {
          resolve({ ...base, status: "launch_error", exitCode: null, stderr: "", error: errorMetadata(error) });
          return;
        }

        let stderr = "";
        let done = false;
        const finish = (result) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ ...base, stderr, ...result });
        };
        helper.stderr?.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        helper.once("error", (error) => finish({ status: "launch_error", exitCode: null, error: errorMetadata(error) }));
        helper.once("close", (code, helperSignal) =>
          finish({ status: code === 0 ? "completed" : "non_zero_exit", exitCode: code, helperSignal }),
        );
        const timer = setTimeout(() => {
          let helperKillSent = null;
          let helperKillError;
          try {
            helperKillSent = helper.kill?.("SIGKILL") ?? null;
          } catch (error) {
            helperKillError = errorMetadata(error);
          }
          helper.stderr?.destroy?.();
          helper.stdout?.destroy?.();
          helper.unref?.();
          finish({
            status: "timeout",
            exitCode: helper.exitCode ?? null,
            helperKillSent,
            ...(helperKillError ? { helperKillError } : {}),
          });
        }, taskkillTimeoutMs);
      });
  }

  return async (proc, { signal = "SIGTERM", detached = true } = {}) => {
    const base = { platform, pid: proc.pid ?? null, signal };
    if (!proc.pid || (!detached && processHasExited(proc))) {
      return { ...base, strategy: detached ? "process_group" : "direct_child", status: "already_exited" };
    }

    let groupError;
    if (detached) {
      try {
        killProcess(-proc.pid, signal);
        return { ...base, strategy: "process_group", status: "sent" };
      } catch (error) {
        groupError = errorMetadata(error);
        if (error?.code === "ESRCH" && processHasExited(proc)) {
          return { ...base, strategy: "process_group", status: "already_exited", error: groupError };
        }
      }
    }

    try {
      const sent = proc.kill(signal);
      return {
        ...base,
        strategy: "direct_child",
        status: sent === false ? "not_sent" : "sent",
        ...(groupError ? { groupError } : {}),
      };
    } catch (error) {
      return {
        ...base,
        strategy: "direct_child",
        status: error?.code === "ESRCH" ? "already_exited" : "error",
        error: errorMetadata(error),
        ...(groupError ? { groupError } : {}),
      };
    }
  };
}

/**
 * Supervise a Pi JSON subprocess through semantic completion and bounded OS cleanup.
 */
export function waitForSubagentProcess(
  proc,
  {
    onEvent,
    onDiagnostic,
    signal,
    detached = process.platform !== "win32",
    terminationGraceMs = DEFAULT_TERMINATION_GRACE_MS,
    postFinalDeadlineMs = DEFAULT_POST_FINAL_DEADLINE_MS,
    cleanupDeadlineMs = DEFAULT_CLEANUP_DEADLINE_MS,
    overallDeadlineMs = DEFAULT_OVERALL_DEADLINE_MS,
    terminateProcessTree = createProcessTreeTerminator(),
    now = Date.now,
  } = {},
) {
  return new Promise((resolve) => {
    const startedAt = now();
    let buffer = "";
    let stderr = "";
    let terminalReason = null;
    let terminalAt = null;
    let finalOutputAt = null;
    let processExitCode = proc.exitCode ?? null;
    let processSignalCode = proc.signalCode ?? null;
    let processError;
    let cleanupStarted = false;
    let cleanupTimedOut = false;
    let processCompletionObserved = false;
    let finished = false;
    let postFinalTimer;
    let cleanupTimer;
    let escalationTimer;
    const cleanupAttempts = [];
    const pendingAttempts = new Set();

    const diagnose = (event, metadata = {}) => onDiagnostic?.(event, metadata);

    const clearTimers = () => {
      clearTimeout(overallTimer);
      clearTimeout(postFinalTimer);
      clearTimeout(cleanupTimer);
      clearTimeout(escalationTimer);
    };

    const releaseHandles = () => {
      proc.stdout?.destroy?.();
      proc.stderr?.destroy?.();
      proc.unref?.();
    };

    const removeListeners = () => {
      signal?.removeEventListener("abort", abort);
      proc.stdout?.off?.("data", onStdout);
      proc.stderr?.off?.("data", onStderr);
      proc.off?.("exit", onExit);
      proc.off?.("close", onClose);
      proc.off?.("error", onError);
    };

    const processLine = (line) => {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        diagnose("json_parse_error", { error: errorMetadata(error), lineBytes: Buffer.byteLength(line, "utf8") });
        return;
      }

      onEvent?.(event);
      if (
        event.type === "message_end" &&
        event.message?.role === "assistant" &&
        event.message.stopReason &&
        event.message.stopReason !== "toolUse"
      ) {
        finalOutputAt = now();
        diagnose("terminal_output", { stopReason: event.message.stopReason });
        clearTimeout(postFinalTimer);
        postFinalTimer = setTimeout(() => chooseTerminal("post_final_timeout"), postFinalDeadlineMs);
      }
      if (event.type === "agent_end" && event.willRetry) {
        clearTimeout(postFinalTimer);
        finalOutputAt = null;
        diagnose("terminal_output_retracted", { reason: "retry" });
      }
      if (event.type === "agent_settled") chooseTerminal("settled");
    };

    const flushBuffer = () => {
      if (buffer.trim()) processLine(buffer);
      buffer = "";
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimers();
      removeListeners();
      flushBuffer();
      const result = {
        terminalReason: terminalReason ?? "process_exit",
        exitCode: processExitCode ?? proc.exitCode ?? null,
        signalCode: processSignalCode ?? proc.signalCode ?? null,
        stderr,
        settled: terminalReason === "settled",
        aborted: terminalReason === "aborted",
        timedOut: terminalReason === "post_final_timeout" || terminalReason === "overall_timeout",
        cleanupTimedOut,
        cleanupAttempts,
        error: processError,
        timestamps: {
          startedAt,
          finalOutputAt,
          terminalAt,
          finishedAt: now(),
        },
      };
      diagnose("helper_resolution", {
        terminalReason: result.terminalReason,
        exitCode: result.exitCode,
        signalCode: result.signalCode,
        cleanupTimedOut,
      });
      resolve(result);
    };

    const finishAfterAttempts = () => {
      if (pendingAttempts.size === 0) {
        finish();
        return;
      }
      Promise.allSettled([...pendingAttempts]).then(finish);
    };

    const runCleanupAttempt = (cleanupSignal) => {
      diagnose("kill_attempt", { signal: cleanupSignal });
      let termination;
      try {
        termination = terminateProcessTree(proc, { signal: cleanupSignal, detached });
      } catch (error) {
        const attempt = { signal: cleanupSignal, status: "error", error: errorMetadata(error) };
        cleanupAttempts.push(attempt);
        diagnose("kill_outcome", attempt);
        return;
      }
      const attemptPromise = Promise.resolve(termination).then(
          (outcome) => {
            const attempt = { signal: cleanupSignal, ...outcome };
            cleanupAttempts.push(attempt);
            diagnose("kill_outcome", attempt);
          },
          (error) => {
            const attempt = { signal: cleanupSignal, status: "error", error: errorMetadata(error) };
            cleanupAttempts.push(attempt);
            diagnose("kill_outcome", attempt);
          },
        )
        .finally(() => pendingAttempts.delete(attemptPromise));
      pendingAttempts.add(attemptPromise);
    };

    const startCleanup = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      runCleanupAttempt("SIGTERM");
      escalationTimer = setTimeout(() => {
        if (!finished && (detached || !processHasExited(proc))) runCleanupAttempt("SIGKILL");
        if (processCompletionObserved && detached) finishAfterAttempts();
      }, terminationGraceMs);
      cleanupTimer = setTimeout(() => {
        if (finished) return;
        cleanupTimedOut = true;
        diagnose("cleanup_deadline", { deadlineMs: cleanupDeadlineMs });
        releaseHandles();
        finish();
      }, cleanupDeadlineMs);
    };

    const chooseTerminal = (reason) => {
      if (terminalReason) {
        diagnose("terminal_ignored", { winner: terminalReason, ignored: reason });
        return false;
      }
      terminalReason = reason;
      terminalAt = now();
      clearTimeout(overallTimer);
      clearTimeout(postFinalTimer);
      signal?.removeEventListener("abort", abort);
      diagnose("terminal_selected", { reason });
      if (reason !== "process_error" || proc.pid) startCleanup();
      return true;
    };

    function abort() {
      diagnose("abort_signal", { winner: terminalReason });
      chooseTerminal("aborted");
    }

    function onStdout(data) {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }

    function onStderr(data) {
      stderr += data.toString();
    }

    function onExit(code, childSignal) {
      processExitCode = code;
      processSignalCode = childSignal;
      diagnose("process_exit", { code, signal: childSignal });
      if (!terminalReason) chooseTerminal("process_exit");
    }

    function onClose(code, childSignal) {
      processCompletionObserved = true;
      processExitCode = code ?? processExitCode;
      processSignalCode = childSignal ?? processSignalCode;
      diagnose("process_close", { code, signal: childSignal });
      if (!terminalReason) chooseTerminal("process_exit");
      flushBuffer();
      if (detached && cleanupStarted) return;
      finishAfterAttempts();
    }

    function onError(error) {
      processCompletionObserved = true;
      processError = errorMetadata(error);
      diagnose("process_error", { error: processError });
      if (!terminalReason) chooseTerminal("process_error");
      if (detached && cleanupStarted) return;
      finishAfterAttempts();
    }

    proc.stdout?.on("data", onStdout);
    proc.stderr?.on("data", onStderr);
    proc.on("exit", onExit);
    proc.on("close", onClose);
    proc.on("error", onError);

    const overallTimer = setTimeout(() => chooseTerminal("overall_timeout"), overallDeadlineMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
