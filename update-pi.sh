#!/usr/bin/env bash
# =============================================================================
# Pi update script
# =============================================================================
#
# Updates a Pi coding agent environment by pulling agents, extensions, themes,
# and config files from the kimgoetzke/coding-agent-configs GitHub repository.
#
# For extensions with npm dependencies, automatically runs `npm install` using
# whatever is available: npm directly, or via `nix shell nixpkgs#nodejs`.
#
# Usage:
#   Interactive:
#     curl -fsSL https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/update-pi.sh | bash
#
#   Local:
#     bash update-pi.sh
#
# Optional environment:
#   - REPO_URL: Override the repository URL/path for local testing
#
# Requirements:
#   - git (for sparse checkout of the repository)
#   - npm or nix (for extensions with npm dependencies)
# =============================================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kimgoetzke/coding-agent-configs.git}"
AGENT_DIR="$HOME/.pi/agent"
REPO_AGENT_DIR=".pi/agent"

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

info()  { printf "\033[0;34m[info]\033[0m  %s\n" "$1"; }
ok()    { printf "\033[0;32m[ok]\033[0m    %s\n" "$1"; }
warn()  { printf "\033[0;33m[warn]\033[0m  %s\n" "$1"; }
error() { printf "\033[0;31m[error]\033[0m %s\n" "$1" >&2; }

# Prompt the user for a yes/no answer. When stdin is a pipe (curl | bash),
# reads from /dev/tty so the user can still respond interactively.
# Returns 1 (no) if no terminal is available.
ask_yes_no() {
  local prompt="$1"
  local answer=""
  printf "%s [y/N] " "$prompt"
  if [ -t 0 ]; then
    read -r answer || true
  else
    { read -r answer < /dev/tty; } 2>/dev/null || true
  fi
  [[ "$answer" =~ ^[Yy]$ ]]
}

# Copy a config file to the target directory, prompting before overwriting.
copy_config_file() {
  local source_file="$1"
  local target_dir="$2"
  local filename
  filename=$(basename "$source_file")
  local target_file="$target_dir/$filename"

  if [ -f "$target_file" ]; then
    if ask_yes_no "  $filename already exists. Overwrite?"; then
      cp "$source_file" "$target_file"
      ok "Overwrote $filename"
    else
      warn "Skipped $filename (kept existing)"
    fi
  else
    cp "$source_file" "$target_file"
    ok "Installed $filename"
  fi
}

# Copy a directory tree to the target parent, replacing any existing directory
# of the same name. Strips any node_modules that may have been committed to the
# source repo so that npm install always produces a clean, platform-correct set.
copy_directory_overwrite() {
  local source_dir="${1%/}"
  local target_parent="$2"
  local dir_name
  dir_name=$(basename "$source_dir")
  local target_dir="$target_parent/$dir_name"

  rm -rf "$target_dir"
  mkdir -p "$target_parent"
  cp -R "$source_dir" "$target_parent/"
  rm -rf "$target_dir/node_modules"
  ok "Installed $dir_name"
}

# Run `npm install` in a directory, trying npm directly first, then falling
# back to `nix shell nixpkgs#nodejs`. Warns and returns non-zero if neither
# is available.
npm_install() {
  local dir="$1"
  local name
  name=$(basename "$dir")

  if command -v npm &>/dev/null; then
    info "Running npm install in $name..."
    (cd "$dir" && npm install --silent)
    ok "npm install complete for $name"
  elif command -v nix &>/dev/null; then
    info "npm not found — using nix shell to run npm install in $name..."
    (cd "$dir" && nix shell nixpkgs#nodejs --command npm install --silent)
    ok "npm install complete for $name (via nix)"
  else
    warn "npm and nix not found — skipped npm install for $name"
    warn "Run 'npm install' manually in $dir"
    return 1
  fi
}

# Returns 0 if the extension directory has npm dependencies, 1 otherwise.
# Checks for a "dependencies" or "devDependencies" key in package.json without
# requiring node to be present.
has_npm_deps() {
  local dir="$1"
  [ -f "$dir/package.json" ] && \
    grep -qE '"(dependencies|devDependencies)"' "$dir/package.json"
}

# -----------------------------------------------------------------------------
# Clone the repository (shallow + sparse for speed)
# -----------------------------------------------------------------------------

echo ""
info "Fetching latest files from the repository..."

TMPDIR_REMOTE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_REMOTE"' EXIT

git clone \
  --depth 1 \
  --filter=blob:none \
  --sparse \
  "$REPO_URL" \
  "$TMPDIR_REMOTE/repo" \
  --quiet 2>/dev/null

git -C "$TMPDIR_REMOTE/repo" sparse-checkout set "$REPO_AGENT_DIR/" 2>/dev/null

ok "Fetched repository contents"

if [ ! -d "$TMPDIR_REMOTE/repo/$REPO_AGENT_DIR" ]; then
  error "Could not find $REPO_AGENT_DIR/ in the repository"
  exit 1
fi

REPO_PI_DIR="$TMPDIR_REMOTE/repo/$REPO_AGENT_DIR"

# -----------------------------------------------------------------------------
# Update agents
# -----------------------------------------------------------------------------

agents_skipped=false
agent_count=0

echo ""
if ask_yes_no "Update agents?"; then
  info "Updating agents..."

  AGENTS_SOURCE="$REPO_PI_DIR/agents"
  AGENTS_TARGET="$AGENT_DIR/agents"
  mkdir -p "$AGENTS_TARGET"

  if [ -d "$AGENTS_SOURCE" ]; then
    for agent_file in "$AGENTS_SOURCE"/*.md; do
      [ -f "$agent_file" ] || continue
      cp "$agent_file" "$AGENTS_TARGET/"
      agent_count=$((agent_count + 1))
      ok "Updated $(basename "$agent_file")"
    done
  fi

  ok "Updated $agent_count agents to $AGENTS_TARGET"
else
  warn "Skipped agents"
  agents_skipped=true
fi

# -----------------------------------------------------------------------------
# Update extensions
# -----------------------------------------------------------------------------

extensions_skipped=false
extension_count=0
npm_failed=()

echo ""
if ask_yes_no "Update extensions?"; then
  info "Updating extensions..."

  EXTENSIONS_SOURCE="$REPO_PI_DIR/extensions"
  EXTENSIONS_TARGET="$AGENT_DIR/extensions"
  mkdir -p "$EXTENSIONS_TARGET"

  if [ -d "$EXTENSIONS_SOURCE" ]; then
    for ext_dir in "$EXTENSIONS_SOURCE"/*/; do
      [ -d "$ext_dir" ] || continue
      copy_directory_overwrite "$ext_dir" "$EXTENSIONS_TARGET"
      ext_name=$(basename "$ext_dir")
      extension_count=$((extension_count + 1))

      if has_npm_deps "$EXTENSIONS_TARGET/$ext_name"; then
        if ! npm_install "$EXTENSIONS_TARGET/$ext_name"; then
          npm_failed+=("$ext_name")
        fi
      fi
    done
  fi

  ok "Updated $extension_count extensions to $EXTENSIONS_TARGET"
else
  warn "Skipped extensions"
  extensions_skipped=true
fi

# -----------------------------------------------------------------------------
# Update themes
# -----------------------------------------------------------------------------

themes_skipped=false
theme_count=0

echo ""
if ask_yes_no "Update themes?"; then
  info "Updating themes..."

  THEMES_SOURCE="$REPO_PI_DIR/themes"
  THEMES_TARGET="$AGENT_DIR/themes"
  mkdir -p "$THEMES_TARGET"

  if [ -d "$THEMES_SOURCE" ]; then
    for theme_file in "$THEMES_SOURCE"/*.json; do
      [ -f "$theme_file" ] || continue
      cp "$theme_file" "$THEMES_TARGET/"
      theme_count=$((theme_count + 1))
      ok "Updated $(basename "$theme_file")"
    done
  fi

  ok "Updated $theme_count themes to $THEMES_TARGET"
else
  warn "Skipped themes"
  themes_skipped=true
fi

# -----------------------------------------------------------------------------
# Update config files
# -----------------------------------------------------------------------------

configs_skipped=false

echo ""
if ask_yes_no "Update config files? (AGENTS.md, settings.json, command-policy.json5)"; then
  info "Updating config files..."
  mkdir -p "$AGENT_DIR"

  for config_file in "AGENTS.md" "settings.json" "command-policy.json5"; do
    if [ -f "$REPO_PI_DIR/$config_file" ]; then
      copy_config_file "$REPO_PI_DIR/$config_file" "$AGENT_DIR"
    else
      warn "$config_file not found in repository — skipped"
    fi
  done
else
  warn "Skipped config files"
  configs_skipped=true
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
echo "=============================="
echo "  Update complete!"
echo "=============================="
echo ""
if [ "$agents_skipped" = true ]; then
  echo "  Agents:     skipped"
else
  echo "  Agents:     $agent_count updated → $AGENT_DIR/agents"
fi
if [ "$extensions_skipped" = true ]; then
  echo "  Extensions: skipped"
else
  echo "  Extensions: $extension_count updated → $AGENT_DIR/extensions"
fi
if [ "$themes_skipped" = true ]; then
  echo "  Themes:     skipped"
else
  echo "  Themes:     $theme_count updated → $AGENT_DIR/themes"
fi
if [ "$configs_skipped" = true ]; then
  echo "  Config:     skipped"
else
  echo "  Config:     $AGENT_DIR"
fi

if [ ${#npm_failed[@]} -gt 0 ]; then
  echo ""
  warn "npm install failed for: ${npm_failed[*]}"
  warn "Install npm or nix, then run 'npm install' in each directory above."
fi

echo ""
