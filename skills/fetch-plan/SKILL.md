---
name: fetch-plan
description: Retrieve saved plans, let the user choose one, then load its planning documents and summarise implementation status. Use when user asks to fetch, reopen, resume, continue, or inspect an existing plan.
argument-hint: [empty to list available | full or partial plan name]
---

# Fetch a Saved Plan

Use this skill to reopen an existing plan created with the `planning-mode` or `planning` skill.

## Persistence

A persistence implementation decides where and how plans are stored. Before listing or opening plans, find the setting:

```bash
cat "$(git rev-parse --show-toplevel 2>/dev/null)/.ai/config" ~/.ai/config 2>/dev/null | grep -m1 '^persistence=' | tr -d '\r'
```

- No output, or an empty value: use `local-ai-folder-markdown`
- `persistence={value}`: use `{value}`. If `../planning/persistence/{value}.md` does not exist, tell the user the value is unknown and use `local-ai-folder-markdown`

Read `../planning/persistence/{implementation}.md` and follow it whenever this skill lists or opens a plan, lists its documents or reads a planning document.

A selected plan may contain these planning documents:

- `plan`
- `progress`
- `findings`
- `questions`

## Phase 1: List plans only

1. List plans; do not read any planning documents yet
2. Sort plans newest first
3. Show the plan names exactly as stored, in a numbered list

Example:

1. `2026-03-20 refactor-auth-flow`
2. `2026-03-18 add-retry-metrics`

If no plans exist, tell the user no saved plans were found and suggest creating one with the `planning-mode` or `planning` skill.

If only a single plan exists, skip "Phase 2: Ask the user to choose" and consider this plan to be the one the user intends to select, then proceed to "Phase 3: Load the selected plan" and load this plan.

## Phase 2: Ask the user to choose

Prompt the user to reply with either:
- the list number, or
- the plan name

Selection rules:
- If the input is a number, resolve it against the numbered list
- If the input is text, try exact plan-name match first
- If no exact match exists, allow a single unambiguous case-insensitive partial match
- If the input is invalid or ambiguous, explain why and ask again
- Do not read any plan documents before a valid selection is resolved

## Phase 3: Load the selected plan

After the user selects a plan, open it and read its available planning documents.

Read in this order:
1. `plan`
2. `progress` (if it exists)
3. `findings`
4. `questions`
5. Any other documents in the plan, if relevant

Only read documents that exist. If the `plan` document is missing, say the plan is incomplete and continue with any other available docs.

## Phase 4: Report implementation status

Summarise the plan's implementation status using only the loaded docs.

Base the status on:
- `plan`: phase statuses and current phase
- `progress`: latest actions and test results (only for multi-phase plans)
- `findings`: blockers, issues, and decisions
- `questions`: unresolved questions or missing user answers

Prefer plain labels such as:
- `Incomplete`
- `Not started`
- `In progress`
- `Blocked`
- `Complete`
- `Unknown`

When reporting back:
- name the selected plan
- state the best-fit implementation status
- briefly justify it with concrete evidence from the docs
- call out missing documents or uncertainty explicitly
- mention any open questions or blockers

## Phase 5: Ask how to proceed

After summarising status, prompt the user for the next step. Offer concise options such as:
1. continue implementation
2. review blockers and open questions
3. improve or update the plan (only if incomplete)
4. give a fuller summary of progress so far

If the user chooses a follow-on action, continue from the selected plan rather than re-listing plans.
