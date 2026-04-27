#!/usr/bin/env bash
# Fetches the latest skills from the kimgoetzke/coding-agent-configs GitHub
# repo and compares them against locally installed skills.
#
# Usage: bash check-updates.sh <skills-dir>
#   skills-dir - path to locally installed skills
#                (e.g. ~/.claude/skills or ~/.copilot/skills)
#
# Output: For each skill, prints one of:
#   UP_TO_DATE:<skill-name>
#   CHANGED:<skill-name>
#   MISSING_LOCALLY:<skill-name>  (exists in repo but not locally)
#
# When CHANGED, the diff follows until a line containing only "END_DIFF".
# Skills that exist locally but not in the repo are silently ignored.

set -euo pipefail

SKILLS_DIR="${1:?Usage: check-updates.sh <skills-dir>}"
REPO_URL="https://github.com/kimgoetzke/coding-agent-configs.git"

# Shallow-clone only the skills/ directory into a temp dir
TMPDIR_REMOTE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_REMOTE"' EXIT

git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMPDIR_REMOTE/repo" --quiet 2>/dev/null
git -C "$TMPDIR_REMOTE/repo" sparse-checkout set skills/ 2>/dev/null

REMOTE_SKILLS="$TMPDIR_REMOTE/repo/skills"

if [ ! -d "$REMOTE_SKILLS" ]; then
  echo "ERROR: Could not fetch skills from $REPO_URL"
  exit 1
fi

HAS_UPDATES=false

for skill_dir in "$REMOTE_SKILLS"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")
  local_skill="$SKILLS_DIR/$skill_name"

  if [ ! -d "$local_skill" ]; then
    echo "MISSING_LOCALLY:$skill_name"
    HAS_UPDATES=true
    continue
  fi

  # Compare all files in this skill
  diff_output=$(diff -rq "$skill_dir" "$local_skill" 2>/dev/null || true)

  if [ -z "$diff_output" ]; then
    echo "UP_TO_DATE:$skill_name"
  else
    echo "CHANGED:$skill_name"
    diff -ru "$local_skill" "$skill_dir" 2>/dev/null || true
    echo "END_DIFF"
    HAS_UPDATES=true
  fi
done

if [ "$HAS_UPDATES" = false ]; then
  echo "ALL_UP_TO_DATE"
fi
