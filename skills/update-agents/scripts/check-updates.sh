#!/usr/bin/env bash
# Fetches the latest agents from the kimgoetzke/coding-agent-configs GitHub repo and compares
# them against locally installed agents.
#
# Usage: bash check-updates.sh <agents-dir>
#   agents-dir - path to locally installed agents
#                (e.g. ~/.claude/agents or ~/.copilot/agents)
#
# Output: For each agent file, prints one of:
#   UP_TO_DATE:<agent-file>
#   CHANGED:<agent-file>
#   MISSING_LOCALLY:<agent-file>  (exists in repo but not locally)
#
# When CHANGED, the diff follows until a line containing only "END_DIFF".
# Agent files that exist locally but not in the repo are silently ignored.

set -euo pipefail

AGENTS_DIR="${1:?Usage: check-updates.sh <agents-dir>}"
REPO_URL="https://github.com/kimgoetzke/coding-agent-configs.git"

case "$AGENTS_DIR" in
  *"/.claude/agents"|".claude/agents")
    REMOTE_AGENTS_PATH=".claude/agents"
    AGENT_GLOB="*.md"
    ;;
  *"/.copilot/agents"|".copilot/agents")
    REMOTE_AGENTS_PATH=".copilot/agents"
    AGENT_GLOB="*.agent.md"
    ;;
  *)
    echo "ERROR: Could not determine remote agent source for AGENTS_DIR='$AGENTS_DIR'"
    echo "Expected a Claude agents path like ~/.claude/agents or a Copilot path like ~/.copilot/agents"
    exit 1
    ;;
esac

# Shallow-clone only the matching remote agents directory into a temp dir
TMPDIR_REMOTE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_REMOTE"' EXIT

git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMPDIR_REMOTE/repo" --quiet 2>/dev/null
git -C "$TMPDIR_REMOTE/repo" sparse-checkout set "$REMOTE_AGENTS_PATH/" 2>/dev/null

REMOTE_AGENTS="$TMPDIR_REMOTE/repo/$REMOTE_AGENTS_PATH"

if [ ! -d "$REMOTE_AGENTS" ]; then
  echo "ERROR: Could not fetch agents from $REPO_URL at $REMOTE_AGENTS_PATH"
  exit 1
fi

HAS_UPDATES=false

for agent_file in "$REMOTE_AGENTS"/$AGENT_GLOB; do
  [ -f "$agent_file" ] || continue
  agent_name=$(basename "$agent_file")
  local_agent="$AGENTS_DIR/$agent_name"

  if [ ! -f "$local_agent" ]; then
    echo "MISSING_LOCALLY:$agent_name"
    HAS_UPDATES=true
    continue
  fi

  diff_output=$(diff -q "$agent_file" "$local_agent" 2>/dev/null || true)

  if [ -z "$diff_output" ]; then
    echo "UP_TO_DATE:$agent_name"
  else
    echo "CHANGED:$agent_name"
    diff -u "$local_agent" "$agent_file" 2>/dev/null || true
    echo "END_DIFF"
    HAS_UPDATES=true
  fi
done

if [ "$HAS_UPDATES" = false ]; then
  echo "ALL_UP_TO_DATE"
fi
