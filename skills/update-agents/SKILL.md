---
name: update-agents
description: Check for and apply updates to locally installed agents from the kimgoetzke/coding-agent-configs GitHub repo. Use when user asks to update agents, sync agents, check for agent updates, or mentions updating their agents.
---

# Update Agents

Check for updates to locally installed agents by fetching the latest from `kimgoetzke/coding-agent-configs` on GitHub and comparing against the local agents directory for the current coding agent product.

## Configuration

- **Remote repo**: `https://github.com/kimgoetzke/coding-agent-configs.git`
- **Scripts location**: Bundled in this skill's `scripts/` directory

### Target directory by tool

| Tool        | Default target directory |
| ----------- | ------------------------ |
| Claude Code | `~/.claude/agents`       |
| Copilot     | `~/.copilot/agents`      |

If you cannot determine which tool you are, ask the user.

## Workflow

### 1. Determine the current tool and target directory

First determine which tool is currently running this skill:

- If you are Claude Code, set:
  - `TARGET_DIR=~/.claude/agents`
  - `SKILL_DIR=~/.claude/skills/update-agents`
- If you are Copilot, set:
  - `TARGET_DIR=~/.copilot/agents`
  - `SKILL_DIR=~/.copilot/skills/update-agents`

If you cannot determine which tool you are, ask the user before proceeding.

Only use the directory for the currently running tool. Do not check or update the other tool's agents directory.

### 2. Check for updates

Run the check script using the current tool's skill directory:

```bash
bash "$SKILL_DIR/scripts/check-updates.sh" "$TARGET_DIR"
```

### 3. Parse the output

The script outputs one line per agent file with a status prefix:

| Prefix                   | Meaning                                           |
| ------------------------ | ------------------------------------------------- |
| `UP_TO_DATE:<name>`      | No changes                                        |
| `CHANGED:<name>`         | Files differ - diff follows until `END_DIFF` line |
| `MISSING_LOCALLY:<name>` | Exists in repo but missing locally                |
| `ALL_UP_TO_DATE`         | No updates available at all                       |

Agent files that exist locally but not in the remote repo are ignored.

### 4. Present results to the user

- If `ALL_UP_TO_DATE`: tell the user all agents are up to date and stop
- Otherwise, **FOR EACH** `CHANGED` or `MISSING_LOCALLY` agent file:
  - List the file name and summarise what changed
  - Show the diff in a code block
  - Ask the user if they want to apply this update

### 5. Apply updates

For each agent file the user approves, run:

```bash
bash "$SKILL_DIR/scripts/apply-update.sh" "$TARGET_DIR" <agent-file>
```

Report success or failure for each.

### 6. Summary

After processing all agents, print a summary:

- How many agents were updated
- How many were skipped
- How many were already up to date
