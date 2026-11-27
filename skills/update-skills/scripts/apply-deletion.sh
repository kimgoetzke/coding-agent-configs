#!/usr/bin/env bash
# Remove a known obsolete skill or file after the user approves it.
set -euo pipefail

usage='Usage: apply-deletion.sh <skills-dir> <skill|file> <name-or-path>'
skills_dir=${1:?$usage}
type=${2:?$usage}
name=${3:?$usage}
source "$(dirname -- "${BASH_SOURCE[0]}")/obsolete-paths.sh"

case "$type" in
  skill) entries=("${OBSOLETE_SKILLS[@]}") ;;
  file) entries=("${OBSOLETE_FILES[@]}") ;;
  *) printf '%s\n' "$usage" >&2; exit 1 ;;
esac

for entry in "${entries[@]}"; do
  [[ "$name" == "${entry%%|*}" ]] || continue
  target="$skills_dir/$name"
  if ! no_symlink_components "$skills_dir" "$name"; then
    printf 'ERROR: Refusing to delete symlinked path: %s\n' "$target" >&2
    exit 1
  fi
  # An empty replacement marks a deprecated path, with nothing to install first.
  replacement_name=${entry#*|}
  if [[ -n "$replacement_name" ]]; then
    replacement="$skills_dir/$replacement_name"
    if [[ "$type" == skill ]]; then
      replacement+=/SKILL.md
    fi
    if [[ ! -f "$replacement" ]]; then
      printf 'ERROR: Install the replacement before deleting %s: %s\n' "$target" "$replacement" >&2
      exit 1
    fi
  fi
  if [[ "$type" == skill && -d "$target" ]]; then
    rm -r -- "$target"
  elif [[ "$type" == file && -f "$target" ]]; then
    rm -- "$target"
  else
    printf 'ERROR: Obsolete %s not found: %s\n' "$type" "$target" >&2
    exit 1
  fi
  printf 'OK: Deleted %s %s\n' "$type" "$name"
  exit 0
done

printf 'ERROR: Not a known obsolete %s: %s\n' "$type" "$name" >&2
exit 1
