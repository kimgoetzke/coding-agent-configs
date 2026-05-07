---
name: planning-mode
description: Toggle persistent planning mode on/off. When on, hook support can remind the agent to keep planning documents updated throughout the conversation, with manual fallback if unavailable. Combines the full planning workflow with persistent mode for long-running planning and implementation sessions. Use with a topic to start, with "continue" to resume an existing plan, or with "off" to stop.
argument-hint: [topic or 'continue' or 'off' or empty]
---

## Usage

- `/planning-mode` — Enable planning mode, then prompt for a topic
- `/planning-mode <topic>` — Enable planning mode and start planning
- `/planning-mode continue` — List existing plan folders and resume one
- `/planning-mode off` — Disable planning mode

## Configuration

Planning mode works best with automated reminders, but it can still run with manual planning-doc updates when hook support is unavailable.

| Tool        | Hook config location / equivalent                         | Script format argument |
| ----------- | --------------------------------------------------------- | ---------------------- |
| Claude Code | `~/.claude/settings.json`                                 | _(none — default)_     |
| Copilot     | `~/.copilot/hooks.json`                                   | `copilot`              |
| Pi          | Bundled `active-mode` extension in `.pi/agent/extensions/active-mode/` | _(extension-driven)_   |

Claude Code and Copilot support the bundled `PostToolUse` and `SessionStart` hook scripts directly. Pi does not use the same standalone hook configuration files in this repository's starter config. Instead, this starter config now ships a Pi-native `active-mode` extension that reads `.ai/.active-mode`, clears stale flags on fresh session start, injects reminder context before LLM calls, and shows mode status in the UI. If that extension is not installed, fall back to manual planning-doc updates.

If you cannot determine which tool you are, ask the user.

## Planning files

Use persistent markdown files as your "working memory on disk." Context windows are volatile and limited; anything important gets written to disk.

- For any plan, you must create the following files in the plan folder:
  - **plan.md** — Track work breakdown and progress
  - **questions.md** — Track your questions and the user's responses and vice versa
  - **findings.md** — Store research and discoveries
- For multi-phase plans, you must also create:
  - **progress.md** — Session log and test results
- Before creating the planning files, you must read the starting templates in `./templates/`
- You must use the starting templates when creating or updating planning files to guide the structure and content of these files

| File           | Purpose                             | When to Update      | Scope            |
| -------------- | ----------------------------------- | ------------------- | ---------------- |
| `plan.md`      | Work breakdown, decisions           | After each phase    | All plans        |
| `findings.md`  | Research, discoveries               | Per 2-action rule   | All plans        |
| `questions.md` | Log of questions and user responses | Throughout planning | All plans        |
| `progress.md`  | Session log, test results           | Throughout session  | Multi-phase only |

## Workflow

You must follow these steps in order:

### Step 1: Check hook configuration

If the skill was invoked with the argument **"off"**, skip this step and go directly to Step 2.

Otherwise:

- If running in Claude Code, run `bash {skill-dir}/scripts/check-hooks.sh` and parse the structured output.
- If running in Copilot, run `bash {skill-dir}/scripts/check-hooks.sh copilot` and parse the structured output.
- If running in Pi, skip the standalone hook check. Explain that this repository's Pi starter config uses the bundled `active-mode` extension instead of standalone hook files. If that extension is installed, planning mode gets equivalent reminder/cleanup behaviour automatically. Otherwise planning mode will rely on manual update discipline only. Then continue to Step 2.

For Claude Code and Copilot:

- **If `STATUS: YES`**: continue to Step 2.
- **If `STATUS: NO` or `STATUS: PARTIAL`**: offer to install the missing hooks now (see [Hook Setup](#hook-setup) below) **before** proceeding. If the user declines, note that planning mode will rely on manual update discipline only — no PostToolUse reminders and no SessionStart cleanup — then continue.

### Step 2: Determine action

Parse the arguments:

- **No arguments** → go to Step 3a
- **"off"** → go to Step 9
- **"continue"** → go to Step 3c
- **Any other text** → treat as the planning topic, go to Step 3b

### Step 3a: Enable without topic

1. Create `{repo root}/.ai/.active-mode` with:
   ```
   mode: planning
   folder: (pending)
   started: {yyyy-mm-dd HH:mm}
   ```
2. Tell the user: "Planning mode is on. What would you like to plan?"
3. When the user provides a topic, continue to Step 3b.

### Step 3b: Enable with topic

1. Derive `{task-name}` — an extremely succinct name for the task, use kebab-case e.g. `refactor-mfa-flow`.
2. Create the plan folder at `{repo root}/.ai/planning/{yyyy-mm-dd} {task-name}/` where:
   - `{repo root}` is the root of the current repository
   - `{yyyy-mm-dd}` is the date of the plan creation
   - `{task-name}` is the name derived in the previous step
3. If the flag file doesn't exist yet, create `{repo root}/.ai/.active-mode` with:
   ```
   mode: planning
   folder: {repo root}/.ai/planning/{yyyy-mm-dd} {task-name}/
   started: {yyyy-mm-dd HH:mm}
   ```
   If it already exists (from Step 3a), update the `folder:` line.
4. Continue to Step 4.

### Step 3c: Continue an existing plan

1. List directories in `{repo root}/.ai/planning/`.
   - If the directory is missing or contains no plan folders, stop and tell the user: "No existing plans found in `.ai/planning/`. Use `/planning-mode <topic>` to start a new one."
   - On Windows, if Glob fails to list the directory, fall back to `ls "{repo root}/.ai/planning/"` via Bash.
2. Sort newest first (the `{yyyy-mm-dd}` folder prefix sorts correctly lexicographically).
3. Show the folder names exactly as stored in a numbered list. Example:
   ```
   1. 2026-04-10 refactor-auth-flow
   2. 2026-04-08 add-retry-metrics
   ```
4. Prompt the user to reply with either the list number or the folder name.
5. Resolve the selection:
   - If the input is a number, resolve it against the numbered list.
   - If the input is text, try exact folder-name match first.
   - If no exact match, allow a single unambiguous case-insensitive partial match.
   - If the input is invalid, ambiguous, or out of range, stop and tell the user the selection was invalid. Do not re-prompt.
6. Read the planning files in the selected folder so their contents are in context. Read in this order, only what exists:
   1. `plan.md`
   2. `progress.md` (multi-phase plans only)
   3. `findings.md`
   4. `questions.md`

   If `plan.md` is missing, tell the user the plan is incomplete and continue with whatever does exist.
7. Create `{repo root}/.ai/.active-mode` with:
   ```
   mode: planning
   folder: {repo root}/.ai/planning/{selected folder}/
   started: {yyyy-mm-dd HH:mm}
   ```
8. Briefly summarise the plan's current state to the user — current phase, status, any open questions or blockers — based only on the loaded docs.
9. Confirm: "Planning mode is on. Continuing `{folder path}`. Use `/planning-mode off` when done. Planning mode will be auto-disabled by starting a new session when supported by your harness configuration."
10. Recommend renaming the conversation:
    - If running in Claude Code or GitHub Copilot, recommend: "You can run `/rename {task name}` to rename this conversation." where `{task name}` is the folder name with the date prefix removed.
    - If running in Pi, recommend: "You can run `/name {task name}` to name this conversation." where `{task name}` is the folder name with the date prefix removed.
    - Otherwise, recommend: "Consider renaming this conversation to `{task name}` if your tool supports it."
11. Skip Steps 4–7 (the plan already exists). Continue with Step 8 (keep planning documents updated).

### Step 4: Research & discover

1. Gather requirements from the user's request.
2. Create `findings.md` in the plan folder following the template: [templates/findings.md](./templates/findings.md)
3. Explore the codebase to understand the scope of the change.
4. Document findings in `findings.md` as you go.

### Step 5: Determine plan size

Based on your research, explicitly determine whether this is a **multi-phase plan**. A plan is multi-phase if it meets ANY of the following:

- More than 5 files will likely be modified
- More than 5 tool uses are expected
- More than 150 lines of code will change

Document your determination and reasoning at the top of `findings.md` under a `## Plan Size` heading.

### Step 6: Create remaining planning files

Create the remaining planning files from the templates based on the determination in step 5 (see [Planning files](#planning-files)). Populate `plan.md` with the plan and `questions.md` with any unresolved questions. Keep `questions.md` scaffolded even if you have no questions yet, as they may come up later. For multi-phase plans, also create `progress.md` as a stub — it will be populated during execution.

You must use the starting templates (see [Planning files](#planning-files)) when creating or updating planning files to guide the structure and content of these files.

### Step 7: Respond

1. Return a summarised version of the plan to the user. Highlight if there are unresolved questions or if the plan is ready for implementation.
2. Confirm to the user: "Planning mode is on. I'll keep updating the planning docs in {plan folder path} as we go. Use `/planning-mode off` when done. Planning mode will be auto-disabled by starting a new session when supported by your harness configuration."
3. Recommend to the user that they rename this conversation:
   - If running in Claude Code or GitHub Copilot, recommend: "You can run `/rename {task name}` to rename this conversation."
   - If running in Pi, recommend: "You can run `/name {task name}` to name this conversation."
   - Otherwise, recommend: "Consider renaming this conversation to `{task name}` if your tool supports it."

### Step 8: Keep planning documents updated

**This step repeats until the planning mode is off.**

While planning mode is active, if your harness has `PostToolUse` hook support configured, the hook outputs reminders after each tool use. When you see these reminders:

- If you've learned something new since the last update, update the relevant planning document(s) on disk
- If you haven't learned anything new, carry on — don't update for the sake of it
- Keep documents well-structured and up-to-date with the templates
- ALWAYS tell the user if you have updated any planning docs or that you decided no updates to any planning documents were required

### Step 9: Disable

When `/planning-mode off` is invoked:

1. Delete `{repo root}/.ai/.active-mode`
2. Confirm: "Planning mode is off."

### Step 10: Session startup cleanup

For harnesses with `SessionStart` hook support configured, stale flag files from previous sessions are cleared automatically. In Pi, the bundled `active-mode` extension clears stale flags on fresh session start when installed. Without that extension, delete a stale `.ai/.active-mode` file before re-enabling planning mode if one is left behind.

## Critical rules

### 1. Keep docs up-to-date

- Every plan — single-phase or multi-phase — must conclude with all planning files up-to-date
- For multi-phase plans, this applies at the end of every phase, not just the final one
- The plan must have explicit actions to this effect that specifically refer to this `planning` skill (in each phase, for multi-phase plans)
- When updating planning files, do so in line with the templates for these files

### 2. Reference relevant skills

- During planning, you must check the skills available to you that apply to the work in that phase (e.g. `rust-bevy-standards`, `java-conventions`, `tdd`)
- Each phase must have a task to read the relevant skills, followed by a list of those skills
- Any development work must follow test-driven development practices i.e. you have to use your `tdd` skill for any code you write and task descriptions featuring development work must make this clear
- **Do not edit any file in a phase until you have read every skill listed for that phase**

### 3. The 2-action rule

> "After every 2 view/browser/search operations, IMMEDIATELY save key findings to text files."

This prevents visual/multimodal information from being lost.

### 4. Read before decide

Before major decisions, read the plan file. This keeps goals in your attention window.

### 5. Update after act

After completing any phase:

- Update `## Status` in `plan.md`
- Mark phase status: `In progress` → `Complete`
- Log any errors encountered
- Note files created/modified

### 6. Log ALL errors

Every error goes in `plan.md` (the single home for errors across all planning files). This builds knowledge and prevents repetition.

### 7. Never repeat failures

```
if action_failed:
    next_action != same_action
```

Track what you tried. Mutate the approach.

## The 3-strike error protocol

```
ATTEMPT 1: Diagnose & Fix
  → Read error carefully
  → Identify root cause
  → Apply targeted fix

ATTEMPT 2: Alternative Approach
  → Same error? Try different method
  → Different tool? Different library?
  → NEVER repeat exact same failing action

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Consider updating the plan

AFTER 3 FAILURES: Escalate to User
  → Explain what you tried
  → Share the specific error
  → Ask for guidance
```

## Hook Setup

Planning mode relies on two hooks to function fully. Without the PostToolUse hook, only the manual update discipline (Step 8) applies.

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
            "command": "bash ~/.claude/skills/planning-mode/scripts/planning-mode-hook.sh"
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
            "command": "bash ~/.claude/skills/planning-mode/scripts/clear-mode.sh"
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
        "bash": "~/.copilot/skills/planning-mode/scripts/planning-mode-hook.sh copilot"
      }
    ],
    "sessionStart": [
      {
        "type": "command",
        "bash": "~/.copilot/skills/planning-mode/scripts/clear-mode.sh copilot"
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

- [scripts/planning-mode-hook.sh](scripts/planning-mode-hook.sh) — PostToolUse reminder
- [scripts/clear-mode.sh](scripts/clear-mode.sh) — SessionStart cleanup
- [scripts/check-hooks.sh](scripts/check-hooks.sh) — verifies the two hooks above are configured in the relevant settings file

## Templates

- [templates/plan.md](./templates/plan.md) — Work breakdown and progress template
- [templates/findings.md](./templates/findings.md) — Research storage template
- [templates/progress.md](./templates/progress.md) — Session logging template
- [templates/questions.md](./templates/questions.md) — Questions and responses template

## Notes

- **Mutual exclusivity**: There are other modes and they are mutually exclusive. They all share the `.ai/.active-mode` flag file. If another mode is active (check `mode:` field in `.ai/.active-mode`), disable it before enabling planning-mode.
- For harnesses with SessionStart hook support configured, the flag file is automatically cleared at session startup.
- In Pi, the bundled `active-mode` extension provides the equivalent behaviour without standalone hook files.
- If you need to persist planning mode across sessions, re-enable it with `/planning-mode` at the start of the new session.
- Both hook scripts are silent when the flag file doesn't exist — no impact on normal conversations.
