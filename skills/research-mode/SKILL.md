---
name: research-mode
description: Toggle persistent research mode on/off. When on, hook support can remind the agent to keep the research document updated throughout the conversation, with manual fallback if unavailable. Use with a research topic to start, with "continue" to resume an existing research doc, or with "off" to stop.
argument-hint: [topic or 'continue' or 'off' or empty]
---

## Usage

- `/research-mode` — Enable research mode, then prompt for a topic
- `/research-mode <topic>` — Enable research mode and start researching the topic
- `/research-mode continue` — List existing research docs and resume one
- `/research-mode off` — Disable research mode

## Configuration

### Hook configuration by tool

| Tool        | Hook config location / equivalent                         | Script format argument |
| ----------- | --------------------------------------------------------- | ---------------------- |
| Claude Code | `~/.claude/settings.json`                                 | _(none — default)_     |
| Copilot     | `~/.copilot/hooks.json`                                   | `copilot`              |
| Pi          | Bundled `active-mode` extension in `.pi/agent/extensions/active-mode/` | _(extension-driven)_   |

Claude Code and Copilot support the bundled `PostToolUse` and `SessionStart` hook scripts directly. Pi does not use the same standalone hook configuration files in this repository's starter config. Instead, this starter config now ships a Pi-native `active-mode` extension that reads `.ai/.active-mode`, clears stale flags on fresh session start, injects reminder context before LLM calls, and shows mode status in the UI. If that extension is not installed, fall back to manual document updates.

If you cannot determine which tool you are, ask the user.

## Workflow

### Step 1: Check hook configuration

If the argument is **"off"**, skip this step and go directly to Step 2.

Otherwise:

- If running in Claude Code, run `bash {skill-dir}/scripts/check-hooks.sh` and parse the structured output.
- If running in Copilot, run `bash {skill-dir}/scripts/check-hooks.sh copilot` and parse the structured output.
- If running in Pi, skip the standalone hook check. Explain that this repository's Pi starter config uses the bundled `active-mode` extension instead of standalone hook files. If that extension is installed, research mode gets equivalent reminder/cleanup behaviour automatically. Otherwise research mode will rely on manual update discipline only. Then continue to Step 2.

For Claude Code and Copilot:

- **If `STATUS: YES`**: continue to Step 2.
- **If `STATUS: NO` or `STATUS: PARTIAL`**: offer to install the missing hooks now (see Hook Setup below) **before** proceeding. If the user declines, note that research mode will rely on manual update discipline only — no PostToolUse reminders and no SessionStart cleanup — then continue.

### Step 2: Determine action

Parse the arguments:

- **No arguments** → go to Step 3a
- **"off"** → go to Step 5
- **"continue"** → go to Step 3c
- **Any other text** → treat as the research topic, go to Step 3b

### Step 3a: Enable without topic

1. Create `{repo root}/.ai/.active-mode` with:
   ```
   mode: research
   topic: (awaiting input)
   document: (pending)
   started: {yyyy-mm-dd HH:mm}
   ```
2. Tell the user: "Research mode is on. What would you like to research?"
3. When the user provides a topic, update the flag file's `topic:` line, then continue to Step 3b.

### Step 3b: Enable with topic

1. If the flag file doesn't exist yet, create `{repo root}/.ai/.active-mode` with:
   ```
   mode: research
   topic: {the research topic}
   document: (pending)
   started: {yyyy-mm-dd HH:mm}
   ```
   If it already exists (from Step 3a), update the `topic:` line.
2. Invoke the `persist` skill to begin researching the topic.
3. After the `persist` skill creates the research document, update the flag file's `document:` line with the file path.
4. Confirm to the user: "Research mode is on. I'll keep updating {document path} as we go. Use `/research-mode off` when done. Research mode will be auto-disabled by starting a new session when supported by your harness configuration."
5. If running in Claude Code, also include in the confirmation: "You can run `/rename {task-name}` to rename this conversation." where `{task-name}` is the document filename with the date prefix and `.md` suffix removed.
6. If running in Pi, instead include: "You can run `/name {task-name}` to name this conversation." where `{task-name}` is the document filename with the date prefix and `.md` suffix removed.

### Step 3c: Continue an existing research doc

1. List markdown files in `{repo root}/.ai/research/`.
   - If the directory is missing or contains no `.md` files, stop and tell the user: "No existing research docs found in `.ai/research/`. Use `/research-mode <topic>` to start a new one."
   - On Windows, if Glob fails to list the directory, fall back to `ls "{repo root}/.ai/research/"` via Bash.
2. Sort newest first (the `{yyyy-mm-dd}` filename prefix sorts correctly lexicographically).
3. Show the filenames exactly as stored in a numbered list. Example:
   ```
   1. 2026-04-10 auth-middleware-analysis.md
   2. 2026-04-08 retry-strategies.md
   ```
4. Prompt the user to reply with either the list number or the filename.
5. Resolve the selection:
   - If the input is a number, resolve it against the numbered list.
   - If the input is text, try exact filename match first (with or without `.md` suffix).
   - If no exact match, allow a single unambiguous case-insensitive partial match.
   - If the input is invalid, ambiguous, or out of range, stop and tell the user the selection was invalid. Do not re-prompt.
6. Read the selected document so its contents are in context.
7. Derive `{topic}` from the filename by removing the `{yyyy-mm-dd} ` prefix and `.md` suffix.
8. Create `{repo root}/.ai/.active-mode` with:
   ```
   mode: research
   topic: {topic}
   document: {full path to the selected doc}
   started: {yyyy-mm-dd HH:mm}
   ```
9. Confirm to the user: "Research mode is on. Continuing `{document path}`. Use `/research-mode off` when done. Research mode will be auto-disabled by starting a new session when supported by your harness configuration."
10. If running in Claude Code, also include in the confirmation: "You can run `/rename {task-name}` to rename this conversation." where `{task-name}` is the document filename with the date prefix and `.md` suffix removed.
11. If running in Pi, instead include: "You can run `/name {task-name}` to name this conversation." where `{task-name}` is the document filename with the date prefix and `.md` suffix removed.

### Step 4: Keep the research document updated

While research mode is active, if your harness has `PostToolUse` hook support configured, the hook outputs reminders after each tool use. When you see these reminders:

- If you've learned something new since the last update, update the research document on disk
- If you haven't learned anything new, carry on — don't update for the sake of it
- Keep the document well-structured: add new sections, refine conclusions, note contradictions

### Step 5: Disable

1. Delete `{repo root}/.ai/.active-mode`
2. Confirm: "Research mode is off."

### Step 6: Session startup cleanup

For harnesses with `SessionStart` hook support configured, stale flag files from previous sessions are cleared automatically. In Pi, the bundled `active-mode` extension clears stale flags on fresh session start when installed. Without that extension, delete a stale `.ai/.active-mode` file before re-enabling research mode if one is left behind.

## Hook Setup

Research mode relies on two hooks to function fully. Without the PostToolUse hook, only the `persist` skill's built-in continuous update behaviour and Step 4 above apply.

Step 1 runs `scripts/check-hooks.sh` to verify configuration automatically for Claude Code and Copilot. If that reports `STATUS: NO` or `STATUS: PARTIAL`, offer to add the missing hooks using the appropriate format below.

### Claude Code

Merge into `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/skills/research-mode/scripts/research-mode-hook.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/skills/research-mode/scripts/clear-mode.sh"
          }
        ]
      }
    ]
  }
}
```

### Copilot

Merge into `~/.copilot/hooks.json`:

```json
{
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "bash": "~/.copilot/skills/research-mode/scripts/research-mode-hook.sh copilot"
      }
    ],
    "sessionStart": [
      {
        "type": "command",
        "bash": "~/.copilot/skills/research-mode/scripts/clear-mode.sh copilot"
      }
    ]
  }
}
```

> **Note**: The `copilot` argument tells the scripts to output JSON with `additionalContext` for Copilot's context injection format.

### Pi

This repository's Pi starter config includes the `active-mode` extension under `.pi/agent/extensions/active-mode/`. That extension uses Pi lifecycle events:

- fresh-session cleanup via `session_start`
- per-turn / post-tool-style reminders via `before_agent_start` and `context`
- visible mode state via `ctx.ui.setStatus()` and `ctx.ui.setWidget()`

If that extension is installed, planning mode gets equivalent reminder and stale-flag cleanup behaviour automatically. If it is not installed, use manual document updates.

### Bundled scripts

- [scripts/research-mode-hook.sh](scripts/research-mode-hook.sh) — PostToolUse reminder
- [scripts/clear-mode.sh](scripts/clear-mode.sh) — SessionStart cleanup
- [scripts/check-hooks.sh](scripts/check-hooks.sh) — verifies the two hooks above are configured in the relevant settings file

## Notes

- For harnesses with SessionStart hook support configured, the flag file is automatically cleared at session startup.
- In Pi, the bundled `active-mode` extension provides the equivalent behaviour without standalone hook files.
- If you need to persist research mode across sessions, re-enable it with `/research-mode` at the start of the new session.
- Both hook scripts are silent when the flag file doesn't exist — no impact on normal conversations.
