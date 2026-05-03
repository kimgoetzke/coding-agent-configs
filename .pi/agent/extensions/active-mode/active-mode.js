import { access, readFile, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const ACTIVE_MODE_STATUS_KEY = "active-mode";
const ACTIVE_MODE_WIDGET_KEY = "active-mode";
const ACTIVE_MODE_CUSTOM_TYPE = "active-mode-reminder";
const ACTIVE_MODE_RELATIVE_PATH = [".ai", ".active-mode"];
const FRESH_SESSION_REASONS = new Set(["startup", "new", "resume", "fork"]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findActiveModeFile(startDir) {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = join(currentDir, ...ACTIVE_MODE_RELATIVE_PATH);
    if (await exists(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

function parseActiveMode(content) {
  const fields = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    fields[match[1].trim()] = match[2].trim();
  }

  return fields;
}

function isPending(value) {
  return !value || value === "(pending)" || value === "(awaiting input)";
}

function summarisePath(path) {
  const trimmed = path.replace(/\/+$/, "");
  return basename(trimmed) || trimmed;
}

function summariseTarget(state) {
  if (state.mode === "planning") {
    if (isPending(state.folder)) {
      return "pending";
    }
    return summarisePath(state.folder);
  }

  if (state.mode === "research") {
    if (!isPending(state.document)) {
      return summarisePath(state.document);
    }
    if (!isPending(state.topic)) {
      return state.topic;
    }
    return "pending";
  }

  if (!isPending(state.document)) {
    return summarisePath(state.document);
  }
  if (!isPending(state.folder)) {
    return summarisePath(state.folder);
  }
  if (!isPending(state.topic)) {
    return state.topic;
  }
  return "active";
}

async function loadActiveMode(startDir) {
  const path = await findActiveModeFile(startDir);
  if (!path) {
    return undefined;
  }

  const content = await readFile(path, "utf8");
  const fields = parseActiveMode(content);

  return {
    path,
    root: dirname(dirname(path)),
    mode: fields.mode || "unknown",
    folder: fields.folder,
    topic: fields.topic,
    document: fields.document,
    started: fields.started,
    fields,
  };
}

function colourise(theme, token, text) {
  if (typeof theme?.fg === "function") {
    return theme.fg(token, text);
  }
  return text;
}

function statusBadgeToken(mode) {
  if (mode === "planning") {
    return "warning";
  }
  if (mode === "research") {
    return "accent";
  }
  return "accent";
}

function buildStatusValue(state, theme) {
  if (!state) {
    return undefined;
  }

  const summary = `${state.mode} · ${summariseTarget(state)}`;
  if (typeof theme?.fg !== "function") {
    return summary;
  }

  return `${colourise(theme, statusBadgeToken(state.mode), "●")}${colourise(theme, "dim", ` ${summary}`)}`;
}

function buildWidgetValue(state) {
  if (!state) {
    return undefined;
  }

  const lines = [`Mode: ${state.mode}`];

  if (!isPending(state.topic)) {
    lines.push(`Topic: ${state.topic}`);
  }
  if (!isPending(state.folder)) {
    lines.push(`Folder: ${state.folder}`);
  }
  if (!isPending(state.document)) {
    lines.push(`Document: ${state.document}`);
  }

  return lines;
}

function buildPlanningReminder(state) {
  if (isPending(state.folder)) {
    return [
      "[Active planning mode]",
      "Create the plan folder and planning documents when ready.",
      "Say whether you updated the planning docs or no update was needed.",
    ].join("\n");
  }

  return [
    "[Active planning mode]",
    `Update planning docs in '${state.folder}' when new findings change them.`,
    "Say whether you updated them or no update was needed.",
  ].join("\n");
}

function buildResearchReminder(state) {
  if (isPending(state.document)) {
    const topic = isPending(state.topic) ? "the active research topic" : state.topic;
    return [
      "[Active research mode]",
      `Create the research document for '${topic}' when ready.`,
      "Say whether you updated the research doc or no update was needed.",
    ].join("\n");
  }

  return [
    "[Active research mode]",
    `Update '${state.document}' when new findings change it.`,
    "Say whether you updated it or no update was needed.",
  ].join("\n");
}

function buildGenericReminder(state) {
  return [
    `[Active ${state.mode} mode]`,
    "Keep the mode artefacts on disk up to date when new findings change them.",
    "Say whether you updated them or no update was needed.",
  ].join("\n");
}

function buildReminder(state) {
  if (state.mode === "planning") {
    return buildPlanningReminder(state);
  }
  if (state.mode === "research") {
    return buildResearchReminder(state);
  }
  return buildGenericReminder(state);
}

function buildPlanningSystemPrompt(state) {
  const lines = [
    "Active planning mode is enabled.",
    isPending(state.folder) ? "Plan folder: pending" : `Plan folder: ${state.folder}`,
    "Keep the planning documents up to date when findings materially change them.",
    "Update plan.md, findings.md, questions.md, and progress.md as applicable.",
    "Do not update them for no reason.",
    "Say whether you updated them or no update was needed.",
  ];

  return lines.join("\n");
}

function buildResearchSystemPrompt(state) {
  const lines = [
    "Active research mode is enabled.",
    !isPending(state.topic) ? `Topic: ${state.topic}` : undefined,
    isPending(state.document) ? "Document: pending" : `Document: ${state.document}`,
    "Keep the research document up to date when findings materially change it.",
    "Do not update it for no reason.",
    "Say whether you updated it or no update was needed.",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildGenericSystemPrompt(state) {
  const lines = [
    `Active ${state.mode} mode is enabled.`,
    !isPending(state.topic) ? `Topic: ${state.topic}` : undefined,
    !isPending(state.folder) ? `Folder: ${state.folder}` : undefined,
    !isPending(state.document) ? `Document: ${state.document}` : undefined,
    "Keep the mode artefacts on disk up to date when findings materially change them.",
    "Do not update them for no reason.",
    "Say whether you updated them or no update was needed.",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildSystemPrompt(state) {
  if (state.mode === "planning") {
    return buildPlanningSystemPrompt(state);
  }
  if (state.mode === "research") {
    return buildResearchSystemPrompt(state);
  }
  return buildGenericSystemPrompt(state);
}

function buildInjectedMessage(state) {
  return {
    role: "custom",
    customType: ACTIVE_MODE_CUSTOM_TYPE,
    content: buildReminder(state),
    display: false,
    timestamp: Date.now(),
  };
}

async function applyUiState(ctx, state) {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.setStatus(ACTIVE_MODE_STATUS_KEY, buildStatusValue(state, ctx.ui.theme));
  ctx.ui.setWidget(ACTIVE_MODE_WIDGET_KEY, buildWidgetValue(state));
}

async function refreshUiState(ctx) {
  const state = await loadActiveMode(ctx.cwd);
  await applyUiState(ctx, state);
  return state;
}

export default function activeModeExtension(pi) {
  pi.on("session_start", async (event, ctx) => {
    if (FRESH_SESSION_REASONS.has(event.reason)) {
      const state = await loadActiveMode(ctx.cwd);
      if (state) {
        await unlink(state.path).catch(() => undefined);
        if (ctx.hasUI) {
          ctx.ui.notify(`[${state.mode} mode] Cleared stale mode flag from previous session`, "info");
        }
        await applyUiState(ctx, undefined);
        return undefined;
      }
    }

    await refreshUiState(ctx);
    return undefined;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const state = await refreshUiState(ctx);
    if (!state) {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildSystemPrompt(state)}`,
    };
  });

  pi.on("context", async (event, ctx) => {
    const state = await loadActiveMode(ctx.cwd);
    if (!state) {
      return undefined;
    }

    const messages = event.messages.filter(
      (message) => !(message.role === "custom" && message.customType === ACTIVE_MODE_CUSTOM_TYPE),
    );
    messages.push(buildInjectedMessage(state));

    return { messages };
  });

  pi.on("tool_result", async (_event, ctx) => {
    await refreshUiState(ctx);
    return undefined;
  });

  pi.on("agent_end", async (_event, ctx) => {
    await refreshUiState(ctx);
    return undefined;
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await applyUiState(ctx, undefined);
    return undefined;
  });
}
