#!/usr/bin/env bash
# =============================================================================
# Setup script
# =============================================================================
#
# Bootstraps a local coding agent environment by pulling skills, agents, and
# config files from the kimgoetzke/coding-agent-configs GitHub repository into
# the correct local directories.
#
# Usage:
#   Interactive (prompts for agent choice):
#     curl -fsSL https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.sh | bash
#
#   Non-interactive (pass agent as argument):
#     curl -fsSL https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.sh | bash -s -- --claude
#     curl -fsSL https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.sh | bash -s -- --copilot
#     curl -fsSL https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.sh | bash -s -- --pi
#
# What it installs:
#   - All shared skills from skills/ -> the selected agent's skills directory
#   - Agent definitions from the selected agent tree -> the local agents directory
#   - Config files from the selected agent tree -> the local config directory
#   - For Pi, optional starter extensions and themes from .pi/agent/
#
# Optional environment:
#   - REPO_URL: Override the repository URL/path for local testing
#
# Requirements:
#   - git (for sparse checkout of the repository)
#   - A terminal (for interactive prompts when piped via curl)
# =============================================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kimgoetzke/coding-agent-configs.git}"

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

info()  { printf "\033[0;34m[info]\033[0m  %s\n" "$1"; }
ok()    { printf "\033[0;32m[ok]\033[0m    %s\n" "$1"; }
warn()  { printf "\033[0;33m[warn]\033[0m  %s\n" "$1"; }
error() { printf "\033[0;31m[error]\033[0m %s\n" "$1" >&2; }

print_usage() {
  echo "Usage: setup.sh [--claude | --copilot | --pi]"
  echo ""
  echo "  --claude   Set up for Claude Code"
  echo "  --copilot  Set up for GitHub Copilot"
  echo "  --pi       Set up for Pi"
  echo ""
  echo "If no flag is provided, the script will prompt interactively."
}

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
# $1 = source file path
# $2 = target directory (e.g. ~/.claude)
copy_config_file() {
  local source_file="$1"
  local target_dir="$2"
  local filename
  filename=$(basename "$source_file")
  local target_file="$target_dir/$filename"

  if [ -f "$target_file" ]; then
    if ask_yes_no "  $filename already exists in $target_dir. Overwrite?"; then
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

# Copy a directory tree to the target parent directory, replacing any existing
# directory with the same name.
# $1 = source directory path
# $2 = target parent directory
copy_directory_overwrite() {
  local source_dir="${1%/}"
  local target_parent="$2"
  local dir_name
  dir_name=$(basename "$source_dir")
  local target_dir="$target_parent/$dir_name"

  rm -rf "$target_dir"
  mkdir -p "$target_parent"
  cp -R "$source_dir" "$target_parent/"
  ok "Installed $dir_name"
}

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------

AGENT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --claude)  AGENT="claude"  ; shift ;;
    --copilot) AGENT="copilot" ; shift ;;
    --pi)      AGENT="pi"      ; shift ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      error "Usage: setup.sh [--claude | --copilot | --pi]"
      exit 1
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Agent selection (interactive if no flag was provided)
# -----------------------------------------------------------------------------

if [ -z "$AGENT" ]; then
  echo ""
  echo "Which coding agent are you using?"
  echo ""
  echo "  1) Claude Code"
  echo "  2) GitHub Copilot"
  echo "  3) Pi"
  echo ""

  if [ -t 0 ]; then
    printf "Enter 1, 2, or 3: "
    read -r choice
  elif { true < /dev/tty; } 2>/dev/null; then
    printf "Enter 1, 2, or 3: "
    read -r choice < /dev/tty
  else
    error "No agent specified and no terminal available for prompting."
    error "Re-run with --claude, --copilot, or --pi."
    exit 1
  fi

  case "$choice" in
    1) AGENT="claude"  ;;
    2) AGENT="copilot" ;;
    3) AGENT="pi"      ;;
    *)
      error "Invalid choice: $choice"
      exit 1
      ;;
  esac
fi

# Set paths based on the selected agent
case "$AGENT" in
  claude)
    AGENT_DIR="$HOME/.claude"
    REPO_AGENT_DIR=".claude"
    AGENT_FILE_GLOB="*.md"
    ;;
  copilot)
    AGENT_DIR="$HOME/.copilot"
    REPO_AGENT_DIR=".copilot"
    AGENT_FILE_GLOB="*.agent.md"
    ;;
  pi)
    AGENT_DIR="$HOME/.pi/agent"
    REPO_AGENT_DIR=".pi/agent"
    AGENT_FILE_GLOB="*.md"
    ;;
esac

echo ""
info "Setting up kimgoetzke/coding-agent-configs for $AGENT"

# -----------------------------------------------------------------------------
# Clone the repository (shallow + sparse for speed)
# -----------------------------------------------------------------------------
# Uses git's partial clone and sparse-checkout to download only the directories
# we need, rather than the entire repository history and contents.
# -----------------------------------------------------------------------------

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

# Check out only the skills directory and the selected agent's directory
if [ "$AGENT" = "pi" ]; then
  git -C "$TMPDIR_REMOTE/repo" sparse-checkout set "skills/" "$REPO_AGENT_DIR/" 2>/dev/null
else
  git -C "$TMPDIR_REMOTE/repo" sparse-checkout set "skills/" "$REPO_AGENT_DIR/" 2>/dev/null
fi

ok "Fetched repository contents"

# Verify the clone contains what we expect
if [ ! -d "$TMPDIR_REMOTE/repo/skills" ]; then
  error "Could not find skills/ in the repository"
  exit 1
fi

if [ ! -d "$TMPDIR_REMOTE/repo/$REPO_AGENT_DIR" ]; then
  error "Could not find $REPO_AGENT_DIR/ in the repository"
  exit 1
fi

# -----------------------------------------------------------------------------
# Install skills
# -----------------------------------------------------------------------------
# Skills are shared across agents and are copied as complete directories.
# Existing skills are overwritten (same behaviour as the update-skills command).
# -----------------------------------------------------------------------------

skill_count=0
skills_skipped=false

echo ""
if ask_yes_no "Install skills?"; then
  info "Installing skills..."

  SKILLS_SOURCE="$TMPDIR_REMOTE/repo/skills"
  SKILLS_TARGET="$AGENT_DIR/skills"
  mkdir -p "$SKILLS_TARGET"

  for skill_dir in "$SKILLS_SOURCE"/*/; do
    [ -d "$skill_dir" ] || continue
    copy_directory_overwrite "$skill_dir" "$SKILLS_TARGET"
    skill_count=$((skill_count + 1))
  done

  ok "Installed $skill_count skills to $SKILLS_TARGET"
else
  warn "Skipped skills installation"
  skills_skipped=true
fi

# -----------------------------------------------------------------------------
# Install agents
# -----------------------------------------------------------------------------
# Agent definitions are agent-specific files. Existing agents are overwritten
# (same behaviour as the update-agents command).
# -----------------------------------------------------------------------------

agent_count=0
agents_skipped=false

echo ""
if ask_yes_no "Install agents?"; then
  info "Installing agents..."

  AGENTS_SOURCE="$TMPDIR_REMOTE/repo/$REPO_AGENT_DIR/agents"
  AGENTS_TARGET="$AGENT_DIR/agents"
  mkdir -p "$AGENTS_TARGET"

  if [ -d "$AGENTS_SOURCE" ]; then
    for agent_file in "$AGENTS_SOURCE"/$AGENT_FILE_GLOB; do
      [ -f "$agent_file" ] || continue
      cp "$agent_file" "$AGENTS_TARGET/"
      agent_count=$((agent_count + 1))
    done
  fi

  ok "Installed $agent_count agents to $AGENTS_TARGET"
else
  warn "Skipped agents installation"
  agents_skipped=true
fi

# -----------------------------------------------------------------------------
# Install config files (with overwrite protection)
# -----------------------------------------------------------------------------
# Config files may contain user-specific customisations (permissions, plugins,
# etc.), so the script prompts before overwriting any that already exist.
# -----------------------------------------------------------------------------

configs_skipped=false

echo ""
if ask_yes_no "Install config files?"; then
  info "Installing config files..."

  CONFIG_SOURCE="$TMPDIR_REMOTE/repo/$REPO_AGENT_DIR"

  # Determine which config files to install based on the agent
  if [ "$AGENT" = "claude" ]; then
    CONFIG_FILES=("CLAUDE.md" "settings.json" "statusline-command.sh")
  elif [ "$AGENT" = "copilot" ]; then
    CONFIG_FILES=("copilot-instructions.md" "hooks.json")
  else
    CONFIG_FILES=("AGENT.md" "settings.json" "command-policy.json5")
  fi

  mkdir -p "$AGENT_DIR"

  for config_file in "${CONFIG_FILES[@]}"; do
    if [ -f "$CONFIG_SOURCE/$config_file" ]; then
      copy_config_file "$CONFIG_SOURCE/$config_file" "$AGENT_DIR"
    else
      warn "$config_file not found in repository — skipped"
    fi
  done
else
  warn "Skipped config files installation"
  configs_skipped=true
fi

# -----------------------------------------------------------------------------
# Install Pi extensions
# -----------------------------------------------------------------------------

pi_extensions_skipped=false
pi_extension_count=0

if [ "$AGENT" = "pi" ]; then
  echo ""
  if ask_yes_no "Install Pi starter extensions?"; then
    info "Installing Pi extensions..."

    PI_EXTENSIONS_SOURCE="$TMPDIR_REMOTE/repo/$REPO_AGENT_DIR/extensions"
    PI_EXTENSIONS_TARGET="$AGENT_DIR/extensions"
    mkdir -p "$PI_EXTENSIONS_TARGET"

    if [ -d "$PI_EXTENSIONS_SOURCE" ]; then
      for extension_dir in "$PI_EXTENSIONS_SOURCE"/*/; do
        [ -d "$extension_dir" ] || continue
        copy_directory_overwrite "$extension_dir" "$PI_EXTENSIONS_TARGET"
        pi_extension_count=$((pi_extension_count + 1))
      done
    fi

    ok "Installed $pi_extension_count Pi extensions to $PI_EXTENSIONS_TARGET"
  else
    warn "Skipped Pi extensions installation"
    pi_extensions_skipped=true
  fi
fi

# -----------------------------------------------------------------------------
# Install Pi themes
# -----------------------------------------------------------------------------

pi_themes_skipped=false
pi_theme_count=0

if [ "$AGENT" = "pi" ]; then
  echo ""
  if ask_yes_no "Install Pi themes?"; then
    info "Installing Pi themes..."

    PI_THEMES_SOURCE="$TMPDIR_REMOTE/repo/$REPO_AGENT_DIR/themes"
    PI_THEMES_TARGET="$AGENT_DIR/themes"
    mkdir -p "$PI_THEMES_TARGET"

    if [ -d "$PI_THEMES_SOURCE" ]; then
      for theme_file in "$PI_THEMES_SOURCE"/*.json; do
        [ -f "$theme_file" ] || continue
        cp "$theme_file" "$PI_THEMES_TARGET/"
        pi_theme_count=$((pi_theme_count + 1))
      done
    fi

    ok "Installed $pi_theme_count Pi themes to $PI_THEMES_TARGET"
  else
    warn "Skipped Pi themes installation"
    pi_themes_skipped=true
  fi
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
echo "=============================="
echo "  Setup complete!"
echo "=============================="
echo ""
echo "  Agent:   $AGENT"
if [ "$skills_skipped" = true ]; then
  echo "  Skills:  skipped"
else
  echo "  Skills:  $skill_count installed to $AGENT_DIR/skills"
fi
if [ "$agents_skipped" = true ]; then
  echo "  Agents:  skipped"
else
  echo "  Agents:  $agent_count installed to $AGENT_DIR/agents"
fi
if [ "$configs_skipped" = true ]; then
  echo "  Config:  skipped"
else
  echo "  Config:  $AGENT_DIR"
fi
if [ "$AGENT" = "pi" ]; then
  if [ "$pi_extensions_skipped" = true ]; then
    echo "  Extensions: skipped"
  else
    echo "  Extensions: $pi_extension_count installed to $AGENT_DIR/extensions"
  fi
  if [ "$pi_themes_skipped" = true ]; then
    echo "  Themes: skipped"
  else
    echo "  Themes: $pi_theme_count installed to $AGENT_DIR/themes"
  fi
fi
echo ""
echo "Next steps:"
echo "  1. Start your coding agent and verify the setup"
echo "  2. Use /update-skills later to fetch updates"
echo ""
