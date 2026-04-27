#!/usr/bin/env bash
# Checks whether the hooks required for research-mode are configured.
#
# Usage:
#   Claude Code: bash check-hooks.sh
#   Copilot:     bash check-hooks.sh copilot
#
# Output: A structured report of hook configuration status.
# The check is a substring scan for the hook script filenames in the
# relevant settings file — robust to JSON shape differences and does not
# require `jq`.
#
# Exit code: always 0 (the agent decides how to act on the results)

set -uo pipefail

FORMAT="${1:-plain}"

POST_TOOL_USE_SCRIPT="research-mode-hook.sh"
SESSION_START_SCRIPT="clear-research-mode.sh"

if [ "$FORMAT" = "copilot" ]; then
  SETTINGS_FILE="$HOME/.copilot/hooks.json"
  TOOL="Copilot"
else
  SETTINGS_FILE="$HOME/.claude/settings.json"
  TOOL="Claude Code"
fi

echo "=== RESEARCH-MODE HOOK CHECK ==="
echo ""
echo "TOOL: $TOOL"
echo "SETTINGS_PATH: $SETTINGS_FILE"
echo ""

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "STATUS: NO"
  echo "POST_TOOL_USE_HOOK: MISSING"
  echo "SESSION_START_HOOK: MISSING"
  echo "DETAIL: Settings file does not exist"
  echo "MISSING: $POST_TOOL_USE_SCRIPT, $SESSION_START_SCRIPT"
  echo "=== END ==="
  exit 0
fi

POST_FOUND=0
SESSION_FOUND=0

if grep -q "$POST_TOOL_USE_SCRIPT" "$SETTINGS_FILE" 2>/dev/null; then
  POST_FOUND=1
fi

if grep -q "$SESSION_START_SCRIPT" "$SETTINGS_FILE" 2>/dev/null; then
  SESSION_FOUND=1
fi

MISSING=""
if [ "$POST_FOUND" -eq 0 ]; then
  MISSING="$POST_TOOL_USE_SCRIPT"
fi
if [ "$SESSION_FOUND" -eq 0 ]; then
  if [ -n "$MISSING" ]; then
    MISSING="$MISSING, $SESSION_START_SCRIPT"
  else
    MISSING="$SESSION_START_SCRIPT"
  fi
fi

if [ "$POST_FOUND" -eq 1 ] && [ "$SESSION_FOUND" -eq 1 ]; then
  echo "STATUS: YES"
  echo "POST_TOOL_USE_HOOK: CONFIGURED"
  echo "SESSION_START_HOOK: CONFIGURED"
elif [ "$POST_FOUND" -eq 1 ] || [ "$SESSION_FOUND" -eq 1 ]; then
  echo "STATUS: PARTIAL"
  if [ "$POST_FOUND" -eq 1 ]; then
    echo "POST_TOOL_USE_HOOK: CONFIGURED"
  else
    echo "POST_TOOL_USE_HOOK: MISSING"
  fi
  if [ "$SESSION_FOUND" -eq 1 ]; then
    echo "SESSION_START_HOOK: CONFIGURED"
  else
    echo "SESSION_START_HOOK: MISSING"
  fi
  echo "MISSING: $MISSING"
else
  echo "STATUS: NO"
  echo "POST_TOOL_USE_HOOK: MISSING"
  echo "SESSION_START_HOOK: MISSING"
  echo "MISSING: $MISSING"
fi

echo "=== END ==="
