import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { createProcessTreeTerminator, waitForSubagentProcess } from "./subagent-process.js";

function spawnFixture(script) {
  return spawn(process.execPath, ["-e", script], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function forceKill(pid) {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // Process already stopped.
  }
}

function fakeProcess() {
  const proc = new EventEmitter();
  proc.pid = 4242;
  proc.exitCode = null;
  proc.signalCode = null;
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = () => true;
  proc.unref = () => {};
  return proc;
}

test("settlement starts process-tree termination before the root can exit", async () => {
  const proc = fakeProcess();
  let attempts = 0;
  const completion = waitForSubagentProcess(proc, {
    cleanupDeadlineMs: 30,
    overallDeadlineMs: 500,
    terminateProcessTree: async () => {
      attempts++;
      return { status: "sent" };
    },
  });

  proc.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
  assert.equal(attempts, 1);
  proc.emit("close", 0, null);
  await completion;
});

test("agent_settled resolves after the cleanup deadline when exit and close are missing", async () => {
  const proc = fakeProcess();
  const diagnostics = [];
  const completion = waitForSubagentProcess(proc, {
    cleanupDeadlineMs: 30,
    terminationGraceMs: 10,
    overallDeadlineMs: 500,
    terminateProcessTree: async (_proc, options) => ({ signal: options.signal, status: "sent" }),
    onDiagnostic: (event, metadata) => diagnostics.push({ event, ...metadata }),
  });

  proc.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
  const result = await Promise.race([
    completion,
    new Promise((_, reject) => setTimeout(() => reject(new Error("supervisor did not resolve")), 150)),
  ]);

  assert.equal(result.terminalReason, "settled");
  assert.equal(result.settled, true);
  assert.equal(result.exitCode, null);
  assert.equal(result.cleanupTimedOut, true);
  assert.ok(diagnostics.some((entry) => entry.event === "cleanup_deadline"));
});

test("abort before settlement wins terminal arbitration", async () => {
  const proc = fakeProcess();
  const controller = new AbortController();
  const completion = waitForSubagentProcess(proc, {
    signal: controller.signal,
    cleanupDeadlineMs: 100,
    terminationGraceMs: 10,
    overallDeadlineMs: 500,
    terminateProcessTree: async () => ({ status: "sent" }),
  });

  controller.abort();
  proc.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
  proc.emit("close", null, "SIGTERM");
  const result = await completion;

  assert.equal(result.terminalReason, "aborted");
  assert.equal(result.aborted, true);
  assert.equal(result.settled, false);
});

test("abort after settlement cannot reclassify semantic success", async () => {
  const proc = fakeProcess();
  const controller = new AbortController();
  const completion = waitForSubagentProcess(proc, {
    signal: controller.signal,
    cleanupDeadlineMs: 100,
    overallDeadlineMs: 500,
    terminateProcessTree: async () => ({ status: "sent" }),
  });

  proc.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
  controller.abort();
  proc.emit("close", 1, null);
  const result = await completion;

  assert.equal(result.terminalReason, "settled");
  assert.equal(result.settled, true);
  assert.equal(result.aborted, false);
});

test("terminal assistant output without settlement hits the post-final watchdog", async () => {
  const proc = fakeProcess();
  const completion = waitForSubagentProcess(proc, {
    postFinalDeadlineMs: 20,
    cleanupDeadlineMs: 100,
    overallDeadlineMs: 500,
    terminateProcessTree: async () => {
      queueMicrotask(() => proc.emit("close", null, "SIGTERM"));
      return { status: "sent" };
    },
  });

  proc.stdout.write(`${JSON.stringify({
    type: "message_end",
    message: { role: "assistant", stopReason: "stop" },
  })}\n`);
  const result = await completion;

  assert.equal(result.terminalReason, "post_final_timeout");
  assert.equal(result.timedOut, true);
  assert.equal(result.settled, false);
});

test("assistant tool-use messages do not start the post-final watchdog", async () => {
  const proc = fakeProcess();
  const completion = waitForSubagentProcess(proc, {
    postFinalDeadlineMs: 10,
    cleanupDeadlineMs: 100,
    overallDeadlineMs: 500,
    terminateProcessTree: async () => ({ status: "sent" }),
  });

  proc.stdout.write(`${JSON.stringify({
    type: "message_end",
    message: { role: "assistant", stopReason: "toolUse" },
  })}\n`);
  await new Promise((resolve) => setTimeout(resolve, 25));
  proc.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
  proc.emit("close", 0, null);
  const result = await completion;

  assert.equal(result.terminalReason, "settled");
});

test("a child without terminal output hits the overall deadline", async () => {
  const proc = fakeProcess();
  const result = await waitForSubagentProcess(proc, {
    overallDeadlineMs: 20,
    cleanupDeadlineMs: 100,
    terminateProcessTree: async () => {
      queueMicrotask(() => proc.emit("close", null, "SIGTERM"));
      return { status: "sent" };
    },
  });

  assert.equal(result.terminalReason, "overall_timeout");
  assert.equal(result.timedOut, true);
});

test("process exit without close releases streams and handles at the cleanup deadline", async () => {
  const proc = fakeProcess();
  let unreferenced = false;
  proc.unref = () => {
    unreferenced = true;
  };
  const completion = waitForSubagentProcess(proc, {
    cleanupDeadlineMs: 20,
    overallDeadlineMs: 500,
    terminateProcessTree: async () => ({ status: "sent" }),
  });

  proc.emit("exit", 1, null);
  const result = await completion;

  assert.equal(result.terminalReason, "process_exit");
  assert.equal(result.cleanupTimedOut, true);
  assert.equal(proc.stdout.destroyed, true);
  assert.equal(proc.stderr.destroyed, true);
  assert.equal(unreferenced, true);
});

test("unexpected detached process close cleans the surviving process group", async () => {
  const proc = fakeProcess();
  const signals = [];
  const completion = waitForSubagentProcess(proc, {
    detached: true,
    terminationGraceMs: 15,
    cleanupDeadlineMs: 100,
    overallDeadlineMs: 500,
    terminateProcessTree: async (_proc, { signal }) => {
      signals.push(signal);
      return { status: "sent" };
    },
  });

  proc.exitCode = 1;
  proc.emit("close", 1, null);
  const result = await completion;

  assert.equal(result.terminalReason, "process_exit");
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

test("process errors resolve as semantic failures", async () => {
  const proc = fakeProcess();
  const completion = waitForSubagentProcess(proc, {
    overallDeadlineMs: 500,
    terminateProcessTree: async () => ({ status: "sent" }),
  });
  proc.emit("error", Object.assign(new Error("spawn failed"), { code: "ENOENT" }));
  const result = await completion;

  assert.equal(result.terminalReason, "process_error");
  assert.deepEqual(result.error, { name: "Error", message: "spawn failed", code: "ENOENT" });
  assert.equal(result.settled, false);
});

test("Windows termination observes taskkill exit status and stderr", async () => {
  const helper = new EventEmitter();
  helper.stderr = new PassThrough();
  helper.exitCode = null;
  helper.kill = () => true;
  let invocation;
  const terminate = createProcessTreeTerminator({
    platform: "win32",
    spawnProcess: (command, args, options) => {
      invocation = { command, args, options };
      queueMicrotask(() => {
        helper.stderr.write("access denied");
        helper.emit("close", 1, null);
      });
      return helper;
    },
    taskkillTimeoutMs: 100,
  });

  const outcome = await terminate(fakeProcess(), { signal: "SIGTERM" });

  assert.equal(invocation.command, "taskkill");
  assert.deepEqual(invocation.args, ["/F", "/T", "/PID", "4242"]);
  assert.equal(outcome.status, "non_zero_exit");
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stderr, "access denied");
});

test("Windows termination reports taskkill launch errors", async () => {
  const terminate = createProcessTreeTerminator({
    platform: "win32",
    spawnProcess: () => {
      throw Object.assign(new Error("missing taskkill"), { code: "ENOENT" });
    },
  });

  const outcome = await terminate(fakeProcess());

  assert.equal(outcome.status, "launch_error");
  assert.deepEqual(outcome.error, { name: "Error", message: "missing taskkill", code: "ENOENT" });
});

test("Windows termination bounds an unresponsive taskkill helper", async () => {
  const helper = new EventEmitter();
  helper.stderr = new PassThrough();
  helper.exitCode = null;
  let killedWith;
  let unreferenced = false;
  helper.kill = (signal) => {
    killedWith = signal;
    return false;
  };
  helper.unref = () => {
    unreferenced = true;
  };
  const terminate = createProcessTreeTerminator({
    platform: "win32",
    spawnProcess: () => helper,
    taskkillTimeoutMs: 20,
  });

  const outcome = await terminate(fakeProcess());

  assert.equal(outcome.status, "timeout");
  assert.equal(killedWith, "SIGKILL");
  assert.equal(outcome.helperKillSent, false);
  assert.equal(helper.stderr.destroyed, true);
  assert.equal(unreferenced, true);
});

test("POSIX termination signals a detached process group", async () => {
  const calls = [];
  const proc = fakeProcess();
  proc.kill = () => {
    throw new Error("direct child should not be used");
  };
  const terminate = createProcessTreeTerminator({
    platform: "linux",
    killProcess: (pid, signal) => calls.push({ pid, signal }),
  });

  const outcome = await terminate(proc, { signal: "SIGTERM", detached: true });

  assert.deepEqual(calls, [{ pid: -4242, signal: "SIGTERM" }]);
  assert.equal(outcome.strategy, "process_group");
  assert.equal(outcome.status, "sent");
});

test("POSIX termination can signal a surviving detached group after the root exits", async () => {
  const calls = [];
  const proc = fakeProcess();
  proc.exitCode = 0;
  const terminate = createProcessTreeTerminator({
    platform: "linux",
    killProcess: (pid, signal) => calls.push({ pid, signal }),
  });

  const outcome = await terminate(proc, { signal: "SIGKILL", detached: true });

  assert.deepEqual(calls, [{ pid: -4242, signal: "SIGKILL" }]);
  assert.equal(outcome.status, "sent");
  assert.equal(outcome.strategy, "process_group");
});

test("POSIX termination falls back to the direct child after a group permission error", async () => {
  const proc = fakeProcess();
  let directSignal;
  proc.kill = (signal) => {
    directSignal = signal;
    return true;
  };
  const terminate = createProcessTreeTerminator({
    platform: "darwin",
    killProcess: () => {
      throw Object.assign(new Error("not permitted"), { code: "EPERM" });
    },
  });

  const outcome = await terminate(proc, { signal: "SIGKILL", detached: true });

  assert.equal(directSignal, "SIGKILL");
  assert.equal(outcome.strategy, "direct_child");
  assert.equal(outcome.status, "sent");
  assert.equal(outcome.groupError.code, "EPERM");
});

test("POSIX termination classifies ESRCH as already exited", async () => {
  const proc = fakeProcess();
  proc.kill = () => {
    throw Object.assign(new Error("gone"), { code: "ESRCH" });
  };
  const terminate = createProcessTreeTerminator({
    platform: "linux",
    killProcess: () => {
      throw Object.assign(new Error("group gone"), { code: "ESRCH" });
    },
  });

  const outcome = await terminate(proc, { detached: true });

  assert.equal(outcome.status, "already_exited");
  assert.equal(outcome.error.code, "ESRCH");
  assert.equal(outcome.groupError.code, "ESRCH");
});

test("detached cleanup escalates after root close to terminate surviving descendants", async () => {
  const proc = fakeProcess();
  const signals = [];
  const completion = waitForSubagentProcess(proc, {
    detached: true,
    terminationGraceMs: 15,
    cleanupDeadlineMs: 100,
    overallDeadlineMs: 500,
    terminateProcessTree: async (_proc, { signal }) => {
      signals.push(signal);
      return { status: "sent" };
    },
  });

  proc.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
  proc.exitCode = 0;
  proc.emit("close", 0, null);
  const result = await completion;

  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(result.terminalReason, "settled");
});

test("normal close flushes trailing JSON and stderr before resolution", async () => {
  const proc = fakeProcess();
  const events = [];
  const completion = waitForSubagentProcess(proc, {
    onEvent: (event) => events.push(event.type),
    cleanupDeadlineMs: 100,
    overallDeadlineMs: 500,
    terminateProcessTree: async () => ({ status: "sent" }),
  });

  proc.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
  proc.stdout.write(JSON.stringify({ type: "message_end", message: { role: "assistant" } }));
  proc.stderr.write("trailing stderr");
  proc.emit("close", 0, null);
  const result = await completion;

  assert.deepEqual(events, ["agent_settled", "message_end"]);
  assert.equal(result.stderr, "trailing stderr");
});

test("agent_settled completes a subagent whose event loop remains busy", async () => {
  const child = spawnFixture(
    [
      'console.log(JSON.stringify({ type: "message_end", message: { role: "assistant" } }));',
      'console.log(JSON.stringify({ type: "agent_settled" }));',
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );
  const events = [];
  const startedAt = Date.now();

  const result = await waitForSubagentProcess(child, {
    onEvent: (event) => events.push(event),
    terminationGraceMs: 50,
  });

  assert.equal(result.terminalReason, "settled");
  assert.equal(result.settled, true);
  assert.ok(result.exitCode === null || Number.isInteger(result.exitCode));
  assert.deepEqual(events.map((event) => event.type), ["message_end", "agent_settled"]);
  assert.ok(Date.now() - startedAt < 1000, "completion should not wait for the child event loop");
});

test("agent_settled terminates descendant processes", async () => {
  let descendantPid;
  const child = spawnFixture(
    [
      'const { spawn } = require("node:child_process");',
      'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: process.platform === "win32", stdio: "ignore" });',
      'console.log(JSON.stringify({ type: "descendant", pid: descendant.pid }));',
      'console.log(JSON.stringify({ type: "agent_settled" }));',
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );

  try {
    await waitForSubagentProcess(child, {
      onEvent: (event) => {
        if (event.type === "descendant") descendantPid = event.pid;
      },
      terminationGraceMs: 50,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(isRunning(descendantPid), false);
  } finally {
    if (descendantPid) forceKill(descendantPid);
  }
});
