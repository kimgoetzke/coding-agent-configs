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
#
# What it installs:
#   - All shared skills from skills/ -> ~/.{agent}/skills/
#   - Agent definitions from .{agent}/agents/ -> ~/.{agent}/agents/
#   - Config files from .{agent}/ -> ~/.{agent}/ (prompts before overwriting)
#
# Requirements:
#   - git (for sparse checkout of the repository)
#   - A terminal (for interactive prompts when piped via curl)
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/kimgoetzke/coding-agent-configs.git"

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

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------

AGENT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --claude)  AGENT="claude"  ; shift ;;
    --copilot) AGENT="copilot" ; shift ;;
    -h|--help)
      echo "Usage: setup.sh [--claude | --copilot]"
      echo ""
      echo "  --claude   Set up for Claude Code"
      echo "  --copilot  Set up for GitHub Copilot"
      echo ""
      echo "If no flag is provided, the script will prompt interactively."
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      error "Usage: setup.sh [--claude | --copilot]"
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
  echo ""

  if [ -t 0 ]; then
    printf "Enter 1 or 2: "
    read -r choice
  elif { true < /dev/tty; } 2>/dev/null; then
    printf "Enter 1 or 2: "
    read -r choice < /dev/tty
  else
    error "No agent specified and no terminal available for prompting."
    error "Re-run with --claude or --copilot."
    exit 1
  fi

  case "$choice" in
    1) AGENT="claude"  ;;
    2) AGENT="copilot" ;;
    *)
      error "Invalid choice: $choice"
      exit 1
      ;;
  esac
fi

# Set paths based on the selected agent
AGENT_DIR="$HOME/.$AGENT"
REPO_AGENT_DIR=".$AGENT"

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
git -C "$TMPDIR_REMOTE/repo" sparse-checkout set "skills/" "$REPO_AGENT_DIR/" 2>/dev/null

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
    skill_name=$(basename "$skill_dir")
    mkdir -p "$SKILLS_TARGET/$skill_name"
    cp -r "$skill_dir"* "$SKILLS_TARGET/$skill_name/"
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
# Agent definitions are agent-specific markdown files. Existing agents are
# overwritten (same behaviour as the update-agents command).
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
    for agent_file in "$AGENTS_SOURCE"/*.md; do
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
# Summary
# -----------------------------------------------------------------------------

echo ""
echo "=============================="
echo "  Setup complete!"
echo "=============================="
echo ""
echo "  Agent:   $AGENT"
if [ "$skills_skipped" = true ]; then
  echo "  Skills:  Skipped"
else
  echo "  Skills:  $skill_count installed to $AGENT_DIR/skills"
fi
if [ "$agents_skipped" = true ]; then
  echo "  Agents:  Skipped"
else
  echo "  Agents:  $agent_count installed to $AGENT_DIR/agents"
fi
if [ "$configs_skipped" = true ]; then
  echo "  Config:  Skipped"
else
  echo "  Config:  $AGENT_DIR"
fi
echo ""
echo "Next steps:"
echo "  1. Start your coding agent and verify the setup"
echo "  2. Use /update-skills later to fetch updates"
echo ""
