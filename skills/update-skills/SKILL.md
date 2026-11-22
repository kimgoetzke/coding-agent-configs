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
| Pi          | `~/.pi/agent/skills`     |

If you cannot determine which tool you are, ask the user.

## Workflow

### 1. Determine target directory

Set the target directory based on the table above. Use the variable `TARGET_DIR` in subsequent steps.

Also resolve `SKILL_DIR` to the absolute path of this locally installed skill directory. Typical values:

- Claude Code: `~/.claude/skills/update-skills`
- Copilot: `~/.copilot/skills/update-skills`
- Pi: `~/.pi/agent/skills/update-skills`

### 2. Check for updates

Run the check script:

```bash
bash "$SKILL_DIR/scripts/check-updates.sh" "$TARGET_DIR"
```

### 3. Parse the output

The script outputs one line per skill with a status prefix:

| Prefix                   | Meaning                                           |
| ------------------------ | ------------------------------------------------- |
| `UP_TO_DATE:<name>`      | No changes                                        |
| `CHANGED:<name>`         | Files differ — diff follows until `END_DIFF` line |
| `MISSING_LOCALLY:<name>` | Exists in repo but missing locally                |
| `OBSOLETE_SKILL:<name>\|<replacement>` | Known skill rename; the old skill is still installed. |
| `OBSOLETE_FILE:<path>\|<replacement>` | Known file rename; paths are relative to `$TARGET_DIR`. |
| `ALL_UP_TO_DATE`         | No updates available at all                       |

Ignore local-only skills unless the script reports them as obsolete.

### 4. Present results to the user

- If `ALL_UP_TO_DATE`: tell the user all skills are up to date and stop
- Otherwise, **FOR EACH** `CHANGED` or `MISSING_LOCALLY` skill:
  - List the skill name and summarise what changed (files added/removed/modified)
  - Show the diff in a code block
  - Ask the user if they want to apply this update
- For each obsolete skill or file, name the old path and the replacement. Ask separately whether to delete the old path. Approval to install the replacement does not authorise deletion.

### 5. Apply updates and approved deletions

For each skill the user approves, run:

```bash
bash "$SKILL_DIR/scripts/apply-update.sh" "$TARGET_DIR" <skill-name>
```

Apply selected updates first. Then, for each approved deletion, verify the replacement exists locally. If it is missing, leave the old path in place and report why.

```bash
bash "$SKILL_DIR/scripts/apply-deletion.sh" "$TARGET_DIR" skill <obsolete-skill-name>
bash "$SKILL_DIR/scripts/apply-deletion.sh" "$TARGET_DIR" file <obsolete-relative-path>
```

Report success or failure for each.

### 6. Summary

After processing all skills, print a summary:

- How many skills were updated
- How many obsolete skills and files were deleted
- How many were skipped
- How many were already up to date

Finally, ask the user if they wish to use the /update-agents skill to sync any agents from the remote repo.
