---
name: update-skills
description: Check for and apply updates to locally installed skills from the kimgoetzke/coding-agent-configs GitHub repo. Use when user asks to update skills, sync skills, check for skill updates, or mentions updating their skills.
disable-model-invocation: true
---

# Update Skills

Check for updates to locally installed skills by fetching the latest from `kimgoetzke/coding-agent-configs` on GitHub and comparing against the local skills directory.

## Configuration

- **Remote repo**: `https://github.com/kimgoetzke/coding-agent-configs.git`
- **Scripts location**: Bundled in this skill's `scripts/` directory

### Target directory by tool

| Tool        | Default target directory |
| ----------- | ------------------------ |
| Claude Code | `~/.claude/skills`       |
| Copilot     | `~/.copilot/skills`      |

If you cannot determine which tool you are, ask the user.

## Workflow

### 1. Determine target directory

Set the target directory based on the table above. Use the variable `TARGET_DIR` in subsequent steps.

### 2. Check for updates

Run the check script:

```bash
bash <skill-directory>/scripts/check-updates.sh "$TARGET_DIR"
```

> **Copilot note**: `<skill-directory>` is a Claude Code placeholder. If you are Copilot, use the absolute path to this skill's `scripts/` directory in your local skills instead, i.e. `~/.copilot/skills/update-skills/scripts/check-updates.sh`.

### 3. Parse the output

The script outputs one line per skill with a status prefix:

| Prefix                   | Meaning                                           |
| ------------------------ | ------------------------------------------------- |
| `UP_TO_DATE:<name>`      | No changes                                        |
| `CHANGED:<name>`         | Files differ — diff follows until `END_DIFF` line |
| `MISSING_LOCALLY:<name>` | Exists in repo but missing locally                |
| `ALL_UP_TO_DATE`         | No updates available at all                       |

Skills that exist locally but not in the remote repo are ignored.

### 4. Present results to the user

- If `ALL_UP_TO_DATE`: tell the user all skills are up to date and stop
- Otherwise, **FOR EACH** `CHANGED` or `MISSING_LOCALLY` skill:
  - List the skill name and summarise what changed (files added/removed/modified)
  - Show the diff in a code block
  - Ask the user if they want to apply this update

### 5. Apply updates

For each skill the user approves, run:

```bash
bash <skill-directory>/scripts/apply-update.sh "$TARGET_DIR" <skill-name>
```

> **Copilot note**: Same as above — replace `<skill-directory>` with `~/.copilot/skills/update-skills`.

Report success or failure for each.

### 6. Summary

After processing all skills, print a summary:

- How many skills were updated
- How many were skipped
- How many were already up to date

Finally, ask the user if they wish to use the /update-agents skill to sync any agents from the remote repo.
