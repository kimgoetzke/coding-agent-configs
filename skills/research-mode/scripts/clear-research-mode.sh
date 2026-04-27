#!/bin/bash
# Clears the research mode flag file on session startup.
# Prevents stale research mode from carrying over between sessions.
#
# Usage:
#   Claude Code: bash clear-research-mode.sh
#   Copilot:     bash clear-research-mode.sh copilot

FORMAT="${1:-plain}"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

FLAG_FILE="$REPO_ROOT/.ai/.research-mode"
[ ! -f "$FLAG_FILE" ] && exit 0

rm -f "$FLAG_FILE"

MESSAGE="[Research mode] Cleared stale research mode flag from previous session"

if [ "$FORMAT" = "copilot" ]; then
  ESCAPED=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"continue":true,"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ESCAPED"
else
  echo "$MESSAGE"
fi
