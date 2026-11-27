#!/usr/bin/env bash
# Installed paths migrated by coco. Format: old-path|replacement-path.
# Leave replacement-path empty ('old-path|') to deprecate a path with no successor.
OBSOLETE_SKILLS=(
  'persistent-memory|persist'
  'improve-a-plan|improve-plan'
  'fetch-plan|resume-plan'
)
OBSOLETE_FILES=(
  'research-mode/scripts/clear-research-mode.sh|research-mode/scripts/clear-mode.sh'
)

# The root may be symlinked by the installer. Never follow symlinks below it.
no_symlink_components() {
  local path=$1 remaining=$2
  while [[ "$remaining" == */* ]]; do
    path+=/${remaining%%/*}
    [[ ! -L "$path" ]] || return 1
    remaining=${remaining#*/}
  done
  [[ ! -L "$path/$remaining" ]]
}
