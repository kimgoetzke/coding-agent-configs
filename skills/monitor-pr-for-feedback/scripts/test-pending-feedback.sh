#!/usr/bin/env bash
# Tests pending-feedback.sh against a stubbed `gh` that returns a fixed GraphQL response.
#
# Usage: bash test-pending-feedback.sh

set -uo pipefail

script_directory=$(cd "$(dirname "$0")" && pwd)
pending_feedback="$script_directory/pending-feedback.sh"

workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT

checks=0
failures=0

check() {
  local description="$1"
  local expected="$2"
  local actual="$3"
  checks=$((checks + 1))
  if [ "$expected" = "$actual" ]; then
    printf 'ok    %s\n' "$description"
  else
    printf 'FAIL  %s\n      expected: %s\n      actual:   %s\n' "$description" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

# The stub prints $workspace/response.json, or $workspace/later.json from its
# second call onwards if that file exists, to simulate feedback arriving mid-wait.
# It saves its arguments to $workspace/arguments so the query can be checked.
cat > "$workspace/gh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$@" > "$workspace/arguments"
calls=\$(( \$(cat "$workspace/calls" 2>/dev/null || echo 0) + 1 ))
echo "\$calls" > "$workspace/calls"
if [ "\$calls" -gt 1 ] && [ -f "$workspace/later.json" ]; then
  cat "$workspace/later.json"
else
  cat "$workspace/response.json"
fi
EOF
chmod +x "$workspace/gh"

respond() {
  local state="$1"
  cat > "$workspace/response.json" <<EOF
{"data": {"viewer": {"login": "me"}, "repository": {"pullRequest": {
  "state": "$state",
  "reviewThreads": {"nodes": [
    {"id": "T_open", "isResolved": false, "isOutdated": false, "path": "a.java", "line": 1,
     "comments": {"nodes": [{"id": "T_open_1", "authorAssociation": "COLLABORATOR", "author": {"login": "reviewer"}, "body": "fix this", "url": "u1"}]}},
    {"id": "T_resolved", "isResolved": true, "isOutdated": false, "path": "a.java", "line": 2,
     "comments": {"nodes": [{"author": {"login": "reviewer"}, "body": "fix that", "url": "u2"}]}},
    {"id": "T_answered", "isResolved": false, "isOutdated": false, "path": "a.java", "line": 3,
     "comments": {"nodes": [{"author": {"login": "reviewer"}, "body": "hmm", "url": "u3"},
                            {"author": {"login": "me"}, "body": "❌ Rejected by Opus 5.5. No.\n\n<!-- monitor-pr-for-feedback -->", "url": "u4"}]}},
    {"id": "T_follow_up", "isResolved": false, "isOutdated": true, "path": "a.java", "line": 4,
     "comments": {"nodes": [{"author": {"login": "reviewer"}, "body": "hmm", "url": "u5"},
                            {"id": "T_follow_up_2", "author": {"login": "me"}, "body": "❌ Rejected by Opus 5.5. No.\n\n<!-- monitor-pr-for-feedback -->", "url": "u6"},
                            {"id": "T_follow_up_3", "authorAssociation": "CONTRIBUTOR", "author": {"login": "reviewer"}, "body": "but why", "url": "u7"}]}},
    {"id": "T_user_steers", "isResolved": false, "isOutdated": false, "path": "a.java", "line": 5,
     "comments": {"nodes": [{"author": {"login": "reviewer"}, "body": "hmm", "url": "u15"},
                            {"author": {"login": "me"}, "body": "❌ Rejected by Opus 5.5. No.\n\n<!-- monitor-pr-for-feedback -->", "url": "u16"},
                            {"id": "T_user_steers_3", "author": {"login": "me"}, "body": "actually, do it", "url": "u17"}]}}
  ]},
  "reviews": {"nodes": [
    {"id": "R_pending", "authorAssociation": "MEMBER", "author": {"login": "reviewer"}, "state": "COMMENTED", "body": "rename it", "url": "u8"},
    {"id": "R_empty", "author": {"login": "reviewer"}, "state": "APPROVED", "body": "", "url": "u9"},
    {"id": "R_answered", "author": {"login": "reviewer"}, "state": "COMMENTED", "body": "add a test", "url": "u10"},
    {"id": "R_mine", "author": {"login": "me"}, "state": "COMMENTED", "body": "also update the README", "url": "u11"}
  ]},
  "comments": {"nodes": [
    {"id": "C_pending", "author": {"__typename": "Bot", "login": "bot"}, "body": "coverage 80%", "url": "u12"},
    {"id": "C_reply", "author": {"login": "me"}, "body": "✅ Fixed by Opus 5.5. Done.\n\n<!-- monitor-pr-for-feedback:R_answered -->", "url": "u13"},
    {"id": "C_reply_by_someone_else", "authorAssociation": "NONE", "author": {"login": "other"}, "body": "<!-- monitor-pr-for-feedback:C_pending -->", "url": "u14"},
    {"id": "C_mine", "author": {"login": "me"}, "body": "please add a changelog entry", "url": "u18"},
    {"id": "C_answered", "author": {"login": "reviewer"}, "body": "typo in the README", "url": "u19"},
    {"id": "C_reply_to_comment", "author": {"login": "me"}, "body": "✅ Fixed by Opus 5.5. Done.\n\n<!-- monitor-pr-for-feedback:C_answered -->", "url": "u20"}
  ]}
}}}}
EOF
}

run() {
  output=$(PATH="$workspace:$PATH" bash "$pending_feedback" owner/repo 1 "$@" 2>&1)
  exit_code=$?
  first_line=$(head -1 <<<"$output")
  ids=$(tail -n +2 <<<"$output" | jq -r '[.[].id] | join(",")' 2>/dev/null)
}

echo "  open PR"
respond OPEN
run
check "exits 0" 0 "$exit_code"
check "reports pending" "STATE=PENDING" "$first_line"
queried() { grep -qF "$1" "$workspace/arguments" && echo yes || echo no; }
check "queries the newest threads" yes "$(queried 'reviewThreads(last: 100)')"
check "queries the newest thread comments with their ID, association and author type" yes \
  "$(queried 'comments(last: 50) { nodes { id authorAssociation author { __typename login }')"
check "queries the newest reviews with their association and author type" yes \
  "$(queried 'reviews(last: 100) { nodes { id authorAssociation author { __typename login }')"
check "queries the newest comments with their association and author type" yes \
  "$(queried 'comments(last: 100) { nodes { id authorAssociation author { __typename login }')"
check "keeps unresolved, unanswered and followed-up items, including the user's own" \
  "T_open,T_follow_up,T_user_steers,R_pending,R_mine,C_pending,C_reply_by_someone_else,C_mine" "$ids"
check "leaves out a review the agent already answered" no "$(grep -q R_answered <<<"$ids" && echo yes || echo no)"
check "leaves out a comment the agent already answered" no "$(grep -q C_answered <<<"$ids" && echo yes || echo no)"
untrusted=$(tail -n +2 <<<"$output" | jq -r '[.[] | select(.trusted | not) | .id] | join(",")')
check "trusts the user, owners, members, collaborators and bots only" "T_follow_up,C_reply_by_someone_else" "$untrusted"
for association_and_expected in OWNER:true MEMBER:true COLLABORATOR:true CONTRIBUTOR:false FIRST_TIMER:false NONE:false; do
  association="${association_and_expected%%:*}"
  expected="${association_and_expected##*:}"
  jq --arg association "$association" \
    '(.data.repository.pullRequest.comments.nodes[] | select(.id == "C_reply_by_someone_else") | .authorAssociation) = $association' \
    "$workspace/response.json" > "$workspace/association.json"
  cp "$workspace/association.json" "$workspace/response.json"
  run
  actual=$(tail -n +2 <<<"$output" | jq -r '.[] | select(.id == "C_reply_by_someone_else") | .trusted')
  check "treats $association as trusted=$expected" "$expected" "$actual"
done
respond OPEN

echo "  skip list"
run --skip T_open_1,C_pending
check "leaves out skipped keys" "T_follow_up,T_user_steers,R_pending,R_mine,C_reply_by_someone_else,C_mine" "$ids"
run --skip T_open,T_follow_up_2
check "skipping a thread ID or an older comment's ID does not hide the thread" \
  "T_open,T_follow_up,T_user_steers,R_pending,R_mine,C_pending,C_reply_by_someone_else,C_mine" "$ids"
all_ids="T_open_1,T_follow_up_3,T_user_steers_3,R_pending,R_mine,C_pending,C_reply_by_someone_else,C_mine"
run --skip "$all_ids"
check "reports none when everything is skipped" "STATE=NONE" "$first_line"
check "prints an empty array" "" "$ids"

echo "  waiting"
started=$(date +%s)
run --skip "$all_ids" --wait 3 --interval 1
elapsed=$(( $(date +%s) - started ))
check "reports none after the wait" "STATE=NONE" "$first_line"
check "waits at least the given seconds" yes "$([ "$elapsed" -ge 3 ] && echo yes || echo no)"
started=$(date +%s)
run --skip "$all_ids" --wait 2 --interval 60
elapsed=$(( $(date +%s) - started ))
check "never sleeps past the deadline" yes "$([ "$elapsed" -lt 10 ] && echo yes || echo no)"

echo "  feedback arriving mid-wait"
jq '.data.repository.pullRequest.reviewThreads.nodes[0].comments.nodes +=
      [{"id": "T_open_2", "author": {"login": "reviewer"}, "body": "one more thing", "url": "u21"}]' \
  "$workspace/response.json" > "$workspace/later.json"
rm -f "$workspace/calls"
started=$(date +%s)
run --skip "$all_ids" --wait 30 --interval 1
elapsed=$(( $(date +%s) - started ))
check "reports pending on a later poll" "STATE=PENDING" "$first_line"
check "reports the thread with the new reply" "T_open" "$ids"
check "returns before the deadline" yes "$([ "$elapsed" -lt 30 ] && echo yes || echo no)"
jq '.data.repository.pullRequest.state = "MERGED"' "$workspace/response.json" > "$workspace/later.json"
rm -f "$workspace/calls"
started=$(date +%s)
run --skip "$all_ids" --wait 30 --interval 1
elapsed=$(( $(date +%s) - started ))
check "reports closed on a later poll" "STATE=CLOSED" "$first_line"
check "returns before the deadline when closed" yes "$([ "$elapsed" -lt 30 ] && echo yes || echo no)"
rm -f "$workspace/later.json"

echo "  closed PR"
respond MERGED
run
check "reports closed" "STATE=CLOSED" "$first_line"

echo "  bad arguments"
run --bogus
check "rejects unknown argument" 2 "$exit_code"

echo
echo "$checks checks, $failures failures"
[ "$failures" -eq 0 ]
