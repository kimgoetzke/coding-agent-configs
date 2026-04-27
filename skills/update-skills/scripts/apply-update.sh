#!/usr/bin/env bash
# Fetches a single skill from the kimgoetzke/coding-agent-configs GitHub repo
# and copies it to the local skills directory, overwriting existing files.
#
# Usage: bash apply-update.sh <skills-dir> <skill-name>

set -euo pipefail

SKILLS_DIR="${1:?Usage: apply-update.sh <skills-dir> <skill-name>}"
SKILL_NAME="${2:?Usage: apply-update.sh <skills-dir> <skill-name>}"
REPO_URL="https://github.com/kimgoetzke/coding-agent-configs.git"

# Shallow-clone only the target skill directory
TMPDIR_REMOTE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_REMOTE"' EXIT

git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMPDIR_REMOTE/repo" --quiet 2>/dev/null
git -C "$TMPDIR_REMOTE/repo" sparse-checkout set "skills/$SKILL_NAME/" 2>/dev/null

REMOTE_SKILL="$TMPDIR_REMOTE/repo/skills/$SKILL_NAME"

if [ ! -d "$REMOTE_SKILL" ]; then
  echo "ERROR: Skill '$SKILL_NAME' not found in repo"
  exit 1
fi

LOCAL_SKILL="$SKILLS_DIR/$SKILL_NAME"

# Create local skill dir if it doesn't exist
mkdir -p "$LOCAL_SKILL"

# Copy all files, overwriting
cp -r "$REMOTE_SKILL"/* "$LOCAL_SKILL/"

echo "OK: Updated $SKILL_NAME"
