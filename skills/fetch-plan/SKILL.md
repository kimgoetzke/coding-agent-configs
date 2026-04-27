---
name: fetch-plan
description: Retrieve saved plan folders from `.ai/planning`, let the user choose one, then load its planning documents and summarise implementation status. Use when user asks to fetch, reopen, resume, continue, or inspect an existing plan.
argument-hint: [full or partial folder name or empty]
---

# Fetch a Saved Plan

Use this skill to reopen an existing plan created with the `planning-mode`/`planning` skill's folder structure.

## Storage layout

- Plans live under `{repo root}/.ai/planning/`
- Each plan folder is named `{yyyy-mm-dd} {task name}`
- A selected plan may contain:
  - `plan.md`
  - `progress.md`
  - `findings.md`
  - `questions.md`

## Phase 1: List plans only

1. Find `{repo root}/.ai/planning/`
   - If you don't find anything, try running `ls "{repo root}/.ai/planning/"` via Bash to list the plan folders since Glob fails to match directories on Windows
2. List plan folders only; do not read any files inside them yet
3. Sort folders newest first
4. Show the folder names exactly as stored, in a numbered list

Example:

1. `2026-03-20 refactor auth flow`
2. `2026-03-18 add retry metrics`

If no folders exist, tell the user no saved plans were found and suggest creating one with the `planning-mode` or `planning` skill.

## Phase 2: Ask the user to choose

Prompt the user to reply with either:
- the list number, or
- the folder name

Selection rules:
- If the input is a number, resolve it against the numbered list
- If the input is text, try exact folder-name match first
- If no exact match exists, allow a single unambiguous case-insensitive partial match
- If the input is invalid or ambiguous, explain why and ask again
- Do not read any plan documents before a valid selection is resolved

## Phase 3: Load the selected plan

After the user selects a plan, read the available planning documents from that folder.

Read in this order:
1. `plan.md`
2. `progress.md` (if it exists)
3. `findings.md`
4. `questions.md`
5. Any other files in the folder, if relevant

Only read files that exist. If `plan.md` is missing, say the plan is incomplete and continue with any other available docs.

## Phase 4: Report implementation status

Summarise the plan's implementation status using only the loaded docs.

Base the status on:
- `plan.md` phase statuses and current phase
- `progress.md` latest actions and test results (only for multi-phase plans)
- `findings.md` blockers, issues, and decisions
- `questions.md` unresolved questions or missing user answers

Prefer plain labels such as:
- `Incomplete`
- `Not started`
- `In progress`
- `Blocked`
- `Complete`
- `Unknown`

When reporting back:
- name the selected plan folder
- state the best-fit implementation status
- briefly justify it with concrete evidence from the docs
- call out missing files or uncertainty explicitly
- mention any open questions or blockers

## Phase 5: Ask how to proceed

After summarising status, prompt the user for the next step. Offer concise options such as:
1. continue implementation
2. review blockers and open questions
3. improve or update the plan (only if incomplete)
4. give a fuller summary of progress so far

If the user chooses a follow-on action, continue from the selected plan rather than re-listing plans.
