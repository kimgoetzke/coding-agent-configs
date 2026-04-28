#!/bin/bash
# Research mode hook — reminds the agent to update the research document.
# Configured as a PostToolUse hook in ~/.claude/settings.json or ~/.copilot/hooks/.
#
# Usage:
#   Claude Code: bash research-mode-hook.sh
#   Copilot:     bash research-mode-hook.sh copilot

# Consume stdin (tool use context — not needed here)
cat > /dev/null

FORMAT="${1:-plain}"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

FLAG_FILE="$REPO_ROOT/.ai/.active-mode"
[ ! -f "$FLAG_FILE" ] && exit 0

MODE=$(grep "^mode:" "$FLAG_FILE" 2>/dev/null | cut -d' ' -f2-)
[ "$MODE" != "research" ] && exit 0

TOPIC=$(grep "^topic:" "$FLAG_FILE" 2>/dev/null | cut -d' ' -f2-)
DOCUMENT=$(grep "^document:" "$FLAG_FILE" 2>/dev/null | cut -d' ' -f2-)

if [ -z "$DOCUMENT" ] || [ "$DOCUMENT" = "(pending)" ]; then
  MESSAGE="[Research mode] Topic: $TOPIC — create the research document when ready"
else
  MESSAGE="[Research mode] Update '$DOCUMENT' when you have new findings on: $TOPIC"
fi

if [ "$FORMAT" = "copilot" ]; then
  ESCAPED=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"continue":true,"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$ESCAPED"
else
  echo "$MESSAGE"
fi
