import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import activeModeExtension from "./active-mode.ts";

function createUi(theme: any = undefined) {
  return {
    theme,
    notifications: [] as any[],
    statuses: [] as any[],
    widgets: [] as any[],
    notify(message: string, level = "info") {
      this.notifications.push({ message, level });
    },
    setStatus(key: string, value: any) {
      this.statuses.push({ key, value });
    },
    setWidget(key: string, value: any) {
      this.widgets.push({ key, value });
    },
  };
}

function createPi() {
  const handlers = new Map<string, (event: any, ctx: any) => any>();
  return {
    handlers,
    on(event: string, handler: (event: any, ctx: any) => any) {
      handlers.set(event, handler);
    },
  };
}

async function createProject() {
  const cwd = await mkdtemp(join(tmpdir(), "active-mode-extension-"));
  await mkdir(join(cwd, ".ai"), { recursive: true });
  return cwd;
}

test("session_start clears stale mode files for fresh sessions", async () => {
  const cwd = await createProject();
  const flagFile = join(cwd, ".ai", ".active-mode");
  const ui = createUi();
  const pi = createPi();
  activeModeExtension(pi as any);

  await writeFile(flagFile, "mode: planning\nfolder: /tmp/demo-plan\nstarted: 2026-05-03 10:00\n", "utf8");

  await pi.handlers.get("session_start")?.({ reason: "startup" }, { cwd, hasUI: true, ui });

  await assert.rejects(readFile(flagFile, "utf8"));
  assert.deepEqual(ui.notifications, [
    {
      message: "[planning mode] Cleared stale mode flag from previous session",
      level: "info",
    },
  ]);
  rmSync(cwd, { recursive: true, force: true });
});

test("session_start keeps the flag on reload and publishes active mode status", async () => {
  const cwd = await createProject();
  const flagFile = join(cwd, ".ai", ".active-mode");
  const ui = createUi();
  const pi = createPi();
  activeModeExtension(pi as any);

  await writeFile(flagFile, "mode: research\ntopic: auth flow\ndocument: /tmp/auth-flow.md\nstarted: 2026-05-03 10:00\n", "utf8");

  await pi.handlers.get("session_start")?.({ reason: "reload" }, { cwd, hasUI: true, ui });

  assert.equal(await readFile(flagFile, "utf8"), "mode: research\ntopic: auth flow\ndocument: /tmp/auth-flow.md\nstarted: 2026-05-03 10:00\n");
  assert.deepEqual(ui.statuses.at(-1), {
    key: "active-mode",
    value: "research · auth-flow.md",
  });
  assert.deepEqual(ui.widgets.at(-1), {
    key: "active-mode",
    value: [
      "Mode: research",
      "Topic: auth flow",
      "Document: /tmp/auth-flow.md",
    ],
  });
  rmSync(cwd, { recursive: true, force: true });
});

test("session_start renders a tiny status badge when theme helpers are available", async () => {
  const cwd = await createProject();
  const flagFile = join(cwd, ".ai", ".active-mode");
  const ui = createUi({
    fg(token: string, text: string) {
      return `<${token}>${text}</${token}>`;
    },
  });
  const pi = createPi();
  activeModeExtension(pi as any);

  await writeFile(flagFile, "mode: planning\nfolder: /tmp/demo-plan\nstarted: 2026-05-03 10:00\n", "utf8");

  await pi.handlers.get("session_start")?.({ reason: "reload" }, { cwd, hasUI: true, ui });

  assert.deepEqual(ui.statuses.at(-1), {
    key: "active-mode",
    value: "<warning>●</warning><dim> planning · demo-plan</dim>",
  });
  rmSync(cwd, { recursive: true, force: true });
});

test("context injects a planning reminder before each model call", async () => {
  const cwd = await createProject();
  const flagFile = join(cwd, ".ai", ".active-mode");
  const pi = createPi();
  activeModeExtension(pi as any);

  await writeFile(flagFile, "mode: planning\nfolder: /tmp/demo-plan\nstarted: 2026-05-03 10:00\n", "utf8");

  const result = await pi.handlers.get("context")?.({ messages: [] }, { cwd, hasUI: false });

  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, "custom");
  assert.equal(result.messages[0].display, false);
  assert.match(result.messages[0].content, /^\[Active planning mode\]/);
  assert.match(result.messages[0].content, /Update planning docs in '.*demo-plan'/);
  rmSync(cwd, { recursive: true, force: true });
});

test("before_agent_start appends research-mode instructions to the system prompt", async () => {
  const cwd = await createProject();
  const flagFile = join(cwd, ".ai", ".active-mode");
  const pi = createPi();
  activeModeExtension(pi as any);

  await writeFile(flagFile, "mode: research\ntopic: auth flow\ndocument: /tmp/auth-flow.md\nstarted: 2026-05-03 10:00\n", "utf8");

  const result = await pi.handlers.get("before_agent_start")?.(
    { systemPrompt: "Base prompt", prompt: "Investigate auth flow", images: [] },
    { cwd, hasUI: false },
  );

  assert.match(result.systemPrompt, /^Base prompt/);
  assert.match(result.systemPrompt, /Active research mode is enabled/);
  assert.match(result.systemPrompt, /Topic: auth flow/);
  assert.match(result.systemPrompt, /Document: \/tmp\/auth-flow.md/);
  rmSync(cwd, { recursive: true, force: true });
});
