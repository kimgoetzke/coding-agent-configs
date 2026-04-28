---
name: planning-mode
description: Toggle persistent planning mode on/off. When on, a hook reminds the agent to keep planning documents updated throughout the conversation. Combines the full planning workflow with persistent mode for long-running planning and implementation sessions. Use with a topic to start, or with "off" to stop.
argument-hint: [topic or 'off' or empty]
---

## Usage

- `/planning-mode` — Enable planning mode, then prompt for a topic
- `/planning-mode <topic>` — Enable planning mode and start planning
- `/planning-mode off` — Disable planning mode

## Configuration

The planning mode relies on a hook to remind the agent to keep the planning documents up-to-date.

| Tool        | Hook config location      | Script format argument |
| ----------- | ------------------------- | ---------------------- |
| Claude Code | `~/.claude/settings.json` | _(none — default)_     |
| Copilot     | `~/.copilot/hooks.json`   | `copilot`              |

Both tools support `PostToolUse` and `SessionStart` hooks. Hooks should be installed globally so they work across all projects. The bundled scripts accept an optional format argument: pass `copilot` for Copilot's JSON output format, or omit for Claude Code's plain text output.

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

Otherwise, run `bash {skill-dir}/scripts/check-hooks.sh` (Claude Code) or `bash {skill-dir}/scripts/check-hooks.sh copilot` (Copilot) and parse the structured output.

- **If `STATUS: YES`**: continue to Step 2.
- **If `STATUS: NO` or `STATUS: PARTIAL`**: offer to install the missing hooks now (see [Hook Setup](#hook-setup) below) **before** proceeding. If the user declines, note that planning mode will rely on manual update discipline only — no PostToolUse reminders and no SessionStart cleanup — then continue.

### Step 2: Determine action

Parse the arguments:

- **No arguments** → go to Step 3a
- **"off"** → go to Step 9
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
2. Confirm to the user: "Planning mode is on. I'll keep updating the planning docs in {plan folder path} as we go. Use `/planning-mode off` when done. Planning mode will be auto-disabled by starting a new session."
3. Recommend to the user that they rename this conversation:
   - If running in Claude Code or GitHub Copilot, recommend: "You can run `/rename {task name}` to rename this conversation."
   - Otherwise, recommend: "Consider renaming this conversation to `{task name}` if your tool supports it."

### Step 8: Keep planning documents updated

**This step repeats until the planning mode is off.**

While planning mode is active, the PostToolUse hook outputs reminders after each tool use. When you see these reminders:

- If you've learned something new since the last update, update the relevant planning document(s) on disk
- If you haven't learned anything new, carry on — don't update for the sake of it
- Keep documents well-structured and up-to-date with the templates
- ALWAYS tell the user if you have updated any planning docs or that you decided no updates to any planning documents were required

### Step 9: Disable

When `/planning-mode off` is invoked:

1. Delete `{repo root}/.ai/.active-mode`
2. Confirm: "Planning mode is off."

### Step 10: Session startup cleanup

As a fallback, a `SessionStart` hook automatically clears stale flag files from previous sessions. No manual action needed.

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
- The flag file is automatically cleared at session startup via the SessionStart hook.
- If you need to persist planning mode across sessions, re-enable it with `/planning-mode` at the start of the new session.
- Both hook scripts are silent when the flag file doesn't exist — no impact on normal conversations.
