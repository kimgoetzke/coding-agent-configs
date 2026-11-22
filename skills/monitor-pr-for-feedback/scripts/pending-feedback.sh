#!/usr/bin/env bash
# Lists PR feedback that has not been answered yet, optionally waiting for some.
#
# Usage: pending-feedback.sh <owner/repo> <pr-number> [--wait <seconds>] [--interval <seconds>] [--skip <key,key,...>]
#   pending-feedback.sh owner/repo 42
#   pending-feedback.sh owner/repo 42 --wait 540 --skip PRRC_kwDOAbc,PRR_kwDOxyz
#
# Requires: gh (authenticated), jq.
#
# An agent reply is a comment by the authenticated user whose body contains
# "<!-- monitor-pr-for-feedback". Everything else is feedback, including
# comments by the authenticated user, so the user can steer the agent from
# the PR. Feedback counts as pending when:
#   - thread:  an unresolved review thread whose last comment is not an agent
#              reply (so a follow-up after the agent's answer re-opens it)
#   - review:  a review with a non-empty body and no agent reply containing
#              "<!-- monitor-pr-for-feedback:{id} -->"
#   - comment: an issue comment that is not an agent reply, same rule as a review
# Items whose skipKey is passed via --skip are left out, so the agent can park
# items it is waiting on the user for or chose to ignore. A thread's skipKey is
# the ID of its last comment, so a new reply in a parked thread reports it again.
#
# Each item has "trusted": true when its author (for a thread, the author of the
# last comment) is the authenticated user, an OWNER, MEMBER or COLLABORATOR of the
# repository, or a bot. Bots count as trusted because only GitHub Apps installed
# on the repository can post as one.
#
# Output: first line is STATE=PENDING, STATE=NONE or STATE=CLOSED (PR merged or
# closed), followed by a JSON array of pending items. With --wait, polls every
# --interval seconds (default 300) until something is pending, the PR closes,
# or <seconds> elapse.
#
# Limitation: reads the newest 100 threads, reviews and comments and the newest
# 50 comments per thread, so agent replies stay visible on long PRs. Anything
# older is never reported; add pagination if a PR ever exceeds that.
set -euo pipefail

usage="usage: pending-feedback.sh <owner/repo> <pr-number> [--wait <seconds>] [--interval <seconds>] [--skip <keys>]"
repo="${1:?$usage}"
number="${2:?$usage}"
shift 2
wait_seconds=0
interval_seconds=300
skip=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wait) wait_seconds="$2"; shift 2 ;;
    --interval) interval_seconds="$2"; shift 2 ;;
    --skip) skip="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

owner="${repo%%/*}"
name="${repo##*/}"

# shellcheck disable=SC2016
query='query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state
      reviewThreads(last: 100) {
        nodes {
          id isResolved isOutdated path line
          comments(last: 50) { nodes { id authorAssociation author { __typename login } body url } }
        }
      }
      reviews(last: 100) { nodes { id authorAssociation author { __typename login } state body url } }
      comments(last: 100) { nodes { id authorAssociation author { __typename login } body url } }
    }
  }
}'

fetch() {
  gh api graphql -f query="$query" -F owner="$owner" -F name="$name" -F number="$number" |
    jq --arg skip "$skip" '
      .data.viewer.login as $me
      | .data.repository.pullRequest as $pr
      | ($skip | split(",")) as $skipped
      | def agent_reply: .author.login == $me and (.body | contains("<!-- monitor-pr-for-feedback"));
        ([$pr.comments.nodes[] | select(agent_reply) | .body]) as $replies
      | def answered($id): any($replies[]; contains("<!-- monitor-pr-for-feedback:" + $id + " -->"));
        def trusted: .author.login == $me or .author.__typename == "Bot"
          or (.authorAssociation | IN("OWNER", "MEMBER", "COLLABORATOR"));
        {
        state: $pr.state,
        pending: (
          [ $pr.reviewThreads.nodes[]
            | select(.isResolved | not)
            | select(.comments.nodes[-1] | agent_reply | not)
            | { kind: "thread", id, skipKey: .comments.nodes[-1].id, trusted: (.comments.nodes[-1] | trusted),
                path, line, outdated: .isOutdated,
                url: .comments.nodes[-1].url,
                comments: [.comments.nodes[] | {author: .author.login, body}] } ]
          + [ $pr.reviews.nodes[]
              | select((.body | length) > 0)
              | select(answered(.id) | not)
              | { kind: "review", id, skipKey: .id, trusted: trusted, author: .author.login, state, body, url } ]
          + [ $pr.comments.nodes[]
              | select(agent_reply | not)
              | select(answered(.id) | not)
              | { kind: "comment", id, skipKey: .id, trusted: trusted, author: .author.login, body, url } ]
          | map(select(.skipKey as $key | any($skipped[]; . == $key) | not))
        )
      }'
}

deadline=$(( $(date +%s) + wait_seconds ))
while :; do
  result="$(fetch)"
  state="$(jq -r '.state' <<<"$result")"
  count="$(jq '.pending | length' <<<"$result")"
  remaining=$(( deadline - $(date +%s) ))
  if [[ "$state" != "OPEN" ]]; then
    echo "STATE=CLOSED"
    break
  elif [[ "$count" -gt 0 ]]; then
    echo "STATE=PENDING"
    break
  elif [[ "$remaining" -le 0 ]]; then
    echo "STATE=NONE"
    break
  fi
  # Never sleep past the deadline, so one run stays inside the caller's tool timeout.
  sleep $(( remaining < interval_seconds ? remaining : interval_seconds ))
done
jq '.pending' <<<"$result"
