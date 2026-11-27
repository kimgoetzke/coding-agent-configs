#!/usr/bin/env bash
set -euo pipefail

source_scripts=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
workspace=$(mktemp -d)
trap 'rm -rf -- "$workspace"' EXIT
# Test a copy of the scripts with a deprecated skill added, since the real list may have none.
scripts="$workspace/scripts"
cp -R "$source_scripts" "$scripts"
printf "OBSOLETE_SKILLS+=('deprecated-skill|')\n" >> "$scripts/obsolete-paths.sh"
remote="$workspace/remote"
local_skills="$workspace/installed skills"
mkdir -p "$remote/skills/keep-local" "$remote/skills/persist" "$remote/skills/research-mode/scripts"
printf '# Persist\n' > "$remote/skills/persist/SKILL.md"
printf '#!/usr/bin/env bash\n' > "$remote/skills/research-mode/scripts/clear-mode.sh"
printf '# Keep local\n' > "$remote/skills/keep-local/SKILL.md"
git -C "$remote" init -q
git -C "$remote" add skills
git -C "$remote" -c user.name=Test -c user.email=test@example.com -c commit.gpgsign=false commit -qm fixture

cp -R "$remote/skills" "$local_skills"
mkdir -p "$local_skills/persistent-memory" "$local_skills/deprecated-skill" "$local_skills/custom"
touch "$local_skills/research-mode/scripts/clear-research-mode.sh"

check() { REPO_URL="file://$remote" bash "$scripts/check-updates.sh" "$local_skills"; }
delete() { bash "$scripts/apply-deletion.sh" "$local_skills" "$@"; }
output=$(check)
grep -qxF 'OBSOLETE_SKILL:persistent-memory|persist' <<< "$output"
grep -qxF 'OBSOLETE_SKILL:deprecated-skill|' <<< "$output"
grep -qxF 'OBSOLETE_FILE:research-mode/scripts/clear-research-mode.sh|research-mode/scripts/clear-mode.sh' <<< "$output"
if grep -qE '^(ALL_UP_TO_DATE|OBSOLETE_.*custom)' <<< "$output"; then
  printf '%s\n' 'Unexpected obsolete check output' >&2
  exit 1
fi

if delete skill 'keep-local' || delete file '../outside'; then
  printf '%s\n' 'Unexpected deletion of a path outside the migration list' >&2
  exit 1
fi

# A known path reached through a symlink must not delete an external file.
mv "$local_skills/research-mode/scripts" "$workspace/external"
ln -s "$workspace/external" "$local_skills/research-mode/scripts"
if delete file research-mode/scripts/clear-research-mode.sh; then
  printf '%s\n' 'Unexpected deletion through a symlink' >&2
  exit 1
fi
test -f "$workspace/external/clear-research-mode.sh"
rm -- "$local_skills/research-mode/scripts"
mv "$workspace/external" "$local_skills/research-mode/scripts"

mv "$local_skills/persist/SKILL.md" "$workspace/replacement.md"
if delete skill persistent-memory; then
  printf '%s\n' 'Unexpected deletion before installing replacement' >&2
  exit 1
fi
test -d "$local_skills/persistent-memory"
mv "$workspace/replacement.md" "$local_skills/persist/SKILL.md"

delete skill persistent-memory
# A deprecated skill is deleted without waiting for a replacement.
delete skill deprecated-skill
delete file research-mode/scripts/clear-research-mode.sh
test ! -e "$local_skills/persistent-memory"
test ! -e "$local_skills/deprecated-skill"
test -d "$local_skills/custom"
test -f "$local_skills/keep-local/SKILL.md"
output=$(check)
grep -qxF 'ALL_UP_TO_DATE' <<< "$output"
if grep -q '^OBSOLETE_' <<< "$output"; then
  printf '%s\n' 'Deleted paths were still reported as obsolete' >&2
  exit 1
fi
printf '%s\n' 'Obsolete skill and file checks passed.'
