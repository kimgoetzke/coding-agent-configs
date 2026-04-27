#!/usr/bin/env bash
# Fetches a single agent file from the kimgoetzke/coding-agent-configs GitHub repo and copies it
# to the local agents directory, overwriting any existing file.
#
# Usage: bash apply-update.sh <agents-dir> <agent-file>

set -euo pipefail

AGENTS_DIR="${1:?Usage: apply-update.sh <agents-dir> <agent-file>}"
AGENT_FILE="${2:?Usage: apply-update.sh <agents-dir> <agent-file>}"
REPO_URL="https://github.com/kimgoetzke/coding-agent-configs.git"

# Choose the matching remote agent directory based on the target local agents dir
case "$AGENTS_DIR" in
  *"/.claude/agents"|".claude/agents")
    REMOTE_AGENT_DIR=".claude/agents"
    ;;
  *"/.copilot/agents"|".copilot/agents")
    REMOTE_AGENT_DIR=".copilot/agents"
    ;;
  *)
    echo "ERROR: Could not determine remote agent directory from '$AGENTS_DIR'"
    exit 1
    ;;
esac

# Shallow-clone only the target agent file directory
TMPDIR_REMOTE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_REMOTE"' EXIT

git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMPDIR_REMOTE/repo" --quiet 2>/dev/null
git -C "$TMPDIR_REMOTE/repo" sparse-checkout set "$REMOTE_AGENT_DIR/" 2>/dev/null

REMOTE_AGENT="$TMPDIR_REMOTE/repo/$REMOTE_AGENT_DIR/$AGENT_FILE"

if [ ! -f "$REMOTE_AGENT" ]; then
  echo "ERROR: Agent '$AGENT_FILE' not found in repo under '$REMOTE_AGENT_DIR'"
  exit 1
fi

mkdir -p "$AGENTS_DIR"
LOCAL_AGENT="$AGENTS_DIR/$AGENT_FILE"

cp "$REMOTE_AGENT" "$LOCAL_AGENT"

echo "OK: Updated $AGENT_FILE"
