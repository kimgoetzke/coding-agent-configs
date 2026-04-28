#!/bin/bash
# Planning mode hook — reminds the agent to keep planning documents updated.
# Configured as a PostToolUse hook in ~/.claude/settings.json or ~/.copilot/hooks/.
#
# Usage:
#   Claude Code: bash planning-mode-hook.sh
#   Copilot:     bash planning-mode-hook.sh copilot

# Consume stdin (tool use context — not needed here)
cat > /dev/null

FORMAT="${1:-plain}"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

FLAG_FILE="$REPO_ROOT/.ai/.active-mode"
[ ! -f "$FLAG_FILE" ] && exit 0

MODE=$(grep "^mode:" "$FLAG_FILE" 2>/dev/null | cut -d' ' -f2-)
[ "$MODE" != "planning" ] && exit 0

FOLDER=$(grep "^folder:" "$FLAG_FILE" 2>/dev/null | cut -d' ' -f2-)

if [ -z "$FOLDER" ] || [ "$FOLDER" = "(pending)" ]; then
  MESSAGE="[Planning mode] Create the plan folder and planning documents when ready"
else
  MESSAGE="[Planning mode] Update planning docs in '$FOLDER' when you have new findings"
fi

if [ "$FORMAT" = "copilot" ]; then
  ESCAPED=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"continue":true,"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$ESCAPED"
else
  echo "$MESSAGE"
fi
