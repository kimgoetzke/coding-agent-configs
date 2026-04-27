---
name: research-mode
description: Toggle persistent research mode on/off. When on, a hook reminds the agent to keep the research document updated throughout the conversation. Use with a research topic to start, or with "off" to stop.
argument-hint: [topic or 'off' or empty]
---

## Usage

- `/research-mode` — Enable research mode, then prompt for a topic
- `/research-mode <topic>` — Enable research mode and start researching the topic
- `/research-mode off` — Disable research mode

## Configuration

### Hook configuration by tool

| Tool        | Hook config location      | Script format argument |
| ----------- | ------------------------- | ---------------------- |
| Claude Code | `~/.claude/settings.json` | _(none — default)_     |
| Copilot     | `~/.copilot/hooks.json`   | `copilot`              |

Both tools support `PostToolUse` and `SessionStart` hooks. Hooks should be installed globally so they work across all projects. The bundled scripts accept an optional format argument: pass `copilot` for Copilot's JSON output format, or omit for Claude Code's plain text output.

If you cannot determine which tool you are, ask the user.

## Workflow

### Step 1: Check hook configuration

If the argument is **"off"**, skip this step and go directly to Step 2.

Otherwise, run `bash {skill-dir}/scripts/check-hooks.sh` (Claude Code) or `bash {skill-dir}/scripts/check-hooks.sh copilot` (Copilot) and parse the structured output.

- **If `STATUS: YES`**: continue to Step 2.
- **If `STATUS: NO` or `STATUS: PARTIAL`**: offer to install the missing hooks now (see Hook Setup below) **before** proceeding. If the user declines, note that research mode will rely on manual update discipline only — no PostToolUse reminders and no SessionStart cleanup — then continue.

### Step 2: Determine action

Parse the arguments:

- **No arguments** → go to Step 3a
- **"off"** → go to Step 5
- **Any other text** → treat as the research topic, go to Step 3b

### Step 3a: Enable without topic

1. Create `{repo root}/.ai/.research-mode` with:
   ```
   topic: (awaiting input)
   document: (pending)
   started: {yyyy-mm-dd HH:mm}
   ```
2. Tell the user: "Research mode is on. What would you like to research?"
3. When the user provides a topic, update the flag file's `topic:` line, then continue to Step 3b.

### Step 3b: Enable with topic

1. If the flag file doesn't exist yet, create `{repo root}/.ai/.research-mode` with:
   ```
   topic: {the research topic}
   document: (pending)
   started: {yyyy-mm-dd HH:mm}
   ```
   If it already exists (from Step 3a), update the `topic:` line.
2. Invoke the `persistent-memory` skill to begin researching the topic.
3. After the persistent-memory skill creates the research document, update the flag file's `document:` line with the file path.
4. Confirm to the user: "Research mode is on. I'll keep updating {document path} as we go. Use `/research-mode off` when done. Research mode will be auto-disabled by starting a new session."
5. If running in Claude Code, also include in the confirmation: "You can run `/rename {task-name}` to rename this conversation." where `{task-name}` is the document filename with the date prefix and `.md` suffix removed.

### Step 4: Keep the research document updated

While research mode is active, the PostToolUse hook outputs reminders after each tool use. When you see these reminders:

- If you've learned something new since the last update, update the research document on disk
- If you haven't learned anything new, carry on — don't update for the sake of it
- Keep the document well-structured: add new sections, refine conclusions, note contradictions

### Step 5: Disable

1. Delete `{repo root}/.ai/.research-mode`
2. Confirm: "Research mode is off."

### Step 6: Session startup cleanup

A `SessionStart` hook automatically clears stale flag files from previous sessions. No manual action needed.

## Hook Setup

Research mode relies on two hooks to function fully. Without the PostToolUse hook, only the `persistent-memory` skill's built-in continuous update behaviour and Step 4 above apply.

Step 1 runs `scripts/check-hooks.sh` to verify configuration automatically. If that reports `STATUS: NO` or `STATUS: PARTIAL`, offer to add the missing hooks using the appropriate format below.

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
            "command": "bash ~/.claude/skills/research-mode/scripts/clear-research-mode.sh"
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
        "bash": "~/.copilot/skills/research-mode/scripts/clear-research-mode.sh copilot"
      }
    ]
  }
}
```

> **Note**: The `copilot` argument tells the scripts to output JSON with `additionalContext` for Copilot's context injection format.

### Bundled scripts

- [scripts/research-mode-hook.sh](scripts/research-mode-hook.sh) — PostToolUse reminder
- [scripts/clear-research-mode.sh](scripts/clear-research-mode.sh) — SessionStart cleanup
- [scripts/check-hooks.sh](scripts/check-hooks.sh) — verifies the two hooks above are configured in the relevant settings file

## Notes

- The flag file is automatically cleared at session startup via the SessionStart hook.
- If you need to persist research mode across sessions, re-enable it with `/research-mode` at the start of the new session.
- Both hook scripts are silent when the flag file doesn't exist — no impact on normal conversations.
