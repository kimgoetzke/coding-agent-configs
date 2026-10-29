#!/bin/bash
# Post-edit hook: runs ./mvnw fmt:format on modified .java files
# Requires: mvnw in project root with fmt-maven-plugin
#
# Tested with Claude Code. Use with:
#
# "PostToolUse": [
#   {
#     "matcher": "Edit|Write",
#     "hooks": [
#       {
#         "type": "command",
#         "command": "bash ~/.claude/hooks/format-java.sh",
#         "timeout": 120,
#         "statusMessage": "Running Maven format..."
#       }
#     ]
#   }
# ]

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only process .java files
if [[ "$FILE_PATH" != *.java ]] || [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Find project root by walking up to find mvnw
DIR=$(dirname "$FILE_PATH")
while [[ -n "$DIR" ]]; do
  if [[ -f "$DIR/mvnw" ]]; then
    cd "$DIR" && ./mvnw fmt:format -q > /dev/null 2>&1
    exit 0
  fi
  # Stop at the root: dirname returns its input unchanged for "/", "." and Windows drives like "C:"
  PARENT=$(dirname "$DIR")
  [[ "$PARENT" == "$DIR" ]] && break
  DIR=$PARENT
done

exit 0
