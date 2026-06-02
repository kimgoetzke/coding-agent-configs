#!/usr/bin/env bash
# Claude Code statusLine — styled after JetBrains Dark Island theme
#
# Dark Island palette ANSI approximations:
#   #E0BB65 (yellow)   -> \e[38;2;224;187;101m
#   #56A8F5 (blue)     -> \e[38;2;86;168;245m
#   #CF8E6D (orange)   -> \e[38;2;207;142;109m
#   #6AAB73 (green)    -> \e[38;2;106;171;115m
#   #C77DBB (purple)   -> \e[38;2;199;125;187m
#   #F75464 (red)      -> \e[38;2;247;84;100m
#   reset              -> \e[0m

input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
model=$(echo "$input" | jq -r '.model.display_name // ""')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Shorten path: normalise separators, replace $HOME with ~, then show only last two segments
home="/c/Users/KimGoetzke"
norm_path="${cwd//\\//}"          # convert any backslashes to forward slashes
short_path="${norm_path/#$home/\~}"
# Show only the last two path components, prefixed with ... when truncated; display with backslashes
agnoster_path=$(echo "$short_path" | awk -F'/' '{
  if (NF <= 2) {
    print $0
  } else {
    print "..." FS $(NF-1) FS $NF
  }
}')
agnoster_path="${agnoster_path//\//\\\\}"  # display Windows-style backslashes (doubled to survive printf %b)

# Git branch and file counts (skip optional lock flags to be safe)
git_branch=""
git_staged=0
git_unstaged=0
git_untracked=0
if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null \
    || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
  # Parse --porcelain output: column 1 = index (staged), column 2 = worktree (unstaged)
  while IFS= read -r line; do
    index_char="${line:0:1}"
    worktree_char="${line:1:1}"
    if [ "$index_char" = "?" ] && [ "$worktree_char" = "?" ]; then
      git_untracked=$((git_untracked + 1))
    else
      [ "$index_char" != " " ] && [ "$index_char" != "?" ] && git_staged=$((git_staged + 1))
      [ "$worktree_char" != " " ] && [ "$worktree_char" != "?" ] && git_unstaged=$((git_unstaged + 1))
    fi
  done < <(git -C "$cwd" status --porcelain 2>/dev/null)
fi

# Context usage indicator
context_part=""
if [ -n "$used" ]; then
  used_int=${used%.*}
  if [ "$used_int" -ge 49 ]; then
    # Red when high
    context_part=$(printf '\e[38;2;247;84;100m ctx:%s%%\e[0m' "$used_int")
  else
    context_part=$(printf '\e[38;2;106;171;115m ctx:%s%%\e[0m' "$used_int")
  fi
fi

# Compose the layout — two rows, both left-aligned:
#   row 1: <path>  <branch>  <git counts>
#   row 2: <model>  <context>
path_part=$(printf '\e[38;2;86;168;245m%s\e[0m' "$agnoster_path")
model_part=$(printf '\e[38;2;207;142;109m%s\e[0m' "$model")

row1="$path_part"

if [ -n "$git_branch" ]; then
  branch_part=$(printf '\e[38;2;224;187;101m\xef\x90\x98 %s\e[0m' "$git_branch")
  row1="$row1  $branch_part"
  # Git file count indicators: S=staged (green), U=unstaged (orange), A=untracked (purple)
  git_counts=""
  [ "$git_staged" -gt 0 ]    && git_counts="$git_counts$(printf '\e[38;2;106;171;115mS:%d\e[0m' "$git_staged") "
  [ "$git_unstaged" -gt 0 ]  && git_counts="$git_counts$(printf '\e[38;2;207;142;109mU:%d\e[0m' "$git_unstaged") "
  [ "$git_untracked" -gt 0 ] && git_counts="$git_counts$(printf '\e[38;2;199;125;187mA:%d\e[0m' "$git_untracked") "
  git_counts="${git_counts% }"  # trim trailing space
  [ -n "$git_counts" ] && row1="$row1  $git_counts"
fi

row2="$model_part"
if [ -n "$context_part" ]; then
  row2="$row2 $context_part"
fi

printf '%b\n%b\n' "$row1" "$row2"
