#!/bin/bash
# Clears the active mode flag file on session startup.
# Prevents stale modes from carrying over between sessions.
#
# Usage:
#   Claude Code: bash clear-mode.sh
#   Copilot:     bash clear-mode.sh copilot

FORMAT="${1:-plain}"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

FLAG_FILE="$REPO_ROOT/.ai/.active-mode"
[ ! -f "$FLAG_FILE" ] && exit 0

MODE=$(grep "^mode:" "$FLAG_FILE" 2>/dev/null | cut -d' ' -f2-)

rm -f "$FLAG_FILE"

MESSAGE="[${MODE:-unknown} mode] Cleared stale mode flag from previous session"

if [ "$FORMAT" = "copilot" ]; then
  ESCAPED=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"continue":true,"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ESCAPED"
else
  echo "$MESSAGE"
fi
