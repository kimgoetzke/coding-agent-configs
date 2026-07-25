import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";

import { waitForSubagentProcess } from "./subagent-process.js";

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

  assert.equal(result.exitCode, 0);
  assert.equal(result.settled, true);
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
