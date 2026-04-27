#!/usr/bin/env bash

# PreToolUse hook:
# 1. Blocks Maven/Gradle commands not using project wrappers (./mvnw, ./gradlew)
# 2. Blocks chained Bash commands (&&, ;, |) but || and pipes to head/tail/grep are allowed
#
# Use in Copilot with:
#
# "preToolUse": [
#   {
#     "type": "command",
#     "bash": "~/.copilot/hooks/validate-bash.sh",
#     "timoutSec": 5,
#     "comment": "Prevents certain commands and command chaining"
#   }
# ],
#
# Use in Claude Code with:
#
# "PreToolUse": [
#   {
#     "matcher": "Bash",
#     "hooks": [
#       {
#         "type": "command",
#         "command": "bash ~/.claude/hooks/validate-bash.sh",
#         "timeout": 5
#       }
#     ]
#   }
# ],


set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [[ -z "$CMD" ]]; then
  exit 0
fi

# Block Maven/Gradle commands that don't use the project wrapper (./mvnw, ./gradlew)
STRIPPED=$(echo "$CMD" | sed 's|\./mvnw||g' | sed 's|\./gradlew||g')
if echo "$STRIPPED" | grep -qwE 'mvn|mvnw|gradle|gradlew'; then
  echo '{"decision":"block","reason":"Use the project wrapper (`./mvnw` or `./gradlew`) instead of bare `mvn`/`gradle`/`mvnw`/`gradlew` or a hardcoded path."}' >&2
  exit 2
fi

# Scan the command char-by-char, looking for ;, &&, or | outside quotes.
in_single=0
in_double=0
len=${#CMD}
i=0

while (( i < len )); do
  c="${CMD:$i:1}"

  # Toggle quote state
  if [[ "$c" == "'" && $in_double -eq 0 ]]; then
    in_single=$(( 1 - in_single ))
    i=$((i + 1))
    continue
  fi
  if [[ "$c" == '"' && $in_single -eq 0 ]]; then
    in_double=$(( 1 - in_double ))
    i=$((i + 1))
    continue
  fi

  # Only check operators when outside all quotes
  if (( in_single == 0 && in_double == 0 )); then

    # Check for &&
    if [[ "$c" == "&" && "${CMD:$((i+1)):1}" == "&" ]]; then
      echo '{"decision":"block","reason":"Command contains `&&`. Break this into separate Bash tool calls, one per command."}' >&2
      exit 2
    fi

    # Check for ;
    if [[ "$c" == ";" ]]; then
      echo '{"decision":"block","reason":"Command contains `;`. Break this into separate Bash tool calls, one per command."}' >&2
      exit 2
    fi

    # Skip || (logical OR) — it is not a pipe
    if [[ "$c" == "|" && "${CMD:$((i+1)):1}" == "|" ]]; then
      i=$((i + 2))
      continue
    fi

    # Check for | (but allow | head, | tail, and | grep)
    if [[ "$c" == "|" ]]; then
      # Extract what follows the pipe, trimming leading whitespace
      rest="${CMD:$((i+1))}"
      rest="${rest#"${rest%%[![:space:]]*}"}"
      if [[ ! "$rest" =~ ^head([[:space:]]|$) && ! "$rest" =~ ^tail([[:space:]]|$) && ! "$rest" =~ ^grep([[:space:]]|$) ]]; then
        echo '{"decision":"block","reason":"Command contains a pipe `|` followed by something other than `head`, `tail`, or `grep`. Break this into separate Bash tool calls or use a dedicated tool instead."}' >&2
        exit 2
      fi
      # Allowed pipe — skip past the | character
      i=$((i + 1))
      continue
    fi
  fi

  i=$((i + 1))
done

exit 0
