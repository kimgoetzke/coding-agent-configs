---
name: update-plan
description: Updates planning documents created using the planning-mode or planning skill after questions.md has been updated by the user. Use when user asks to update the plan after having answered your questions.
argument-hint: [full or partial folder name or empty]
---

# Update Plan from User Responses

Process user responses in `questions.md` and update all related planning documents accordingly.

## Prerequisites

- A plan must already exist under `{repo root}/.ai/planning/` created by the `planning` or `planning-mode` skills
- The plan's `questions.md` must contain at least one question with a non-empty `### Response` section

## Phase 1: Locate the plan

Resolve the target plan using the first matching strategy:

1. **Context inference** — check your conversation context for a plan folder path from a prior `planning-mode`/`planning` skill invocation in this session. If found, use it directly and confirm with the user (e.g. "Updating plan `2026-03-24 auth refactor` — correct?"). Proceed on confirmation; if the user says no, fall through to the next strategy.
2. **User argument** — if the user provided an argument, resolve it as a folder name against folders inside `{repo root}/.ai/planning/`.
3. **Single plan** — if only one plan folder exists, select it automatically.
4. **Multiple plans** — list folders newest first in a numbered list and ask the user to choose.
5. **No plans** — tell the user no plans were found and suggest creating one with the `planning-mode` or `planning` skills.

## Phase 2: Read all planning documents

Read the following files from the selected plan folder (skip any that don't exist):

1. `questions.md`
2. `plan.md`
3. `findings.md`
4. `progress.md` (if present)

If `questions.md` does not exist or contains no questions, tell the user there's nothing to process and stop.

## Phase 3: Identify new responses

Scan `questions.md` for questions that have a non-empty `### Response` section. A response is "new" if it has not yet been incorporated into the planning documents.

To track this, after processing a response, add a `<!-- Processed -->` comment directly below the response content. Questions already marked with this comment are skipped.

If no new (unprocessed) responses are found, tell the user and stop.

## Phase 4: Process responses and update documents

For each new response, in order:

1. **Understand the response** — determine what decision, clarification, or constraint the user provided
2. **Assess impact on the plan** — decide whether `plan.md`, `findings.md`, or `progress.md` need updating
3. **Update planning documents** — make targeted edits:
   - `plan.md`: update phases, decisions, key questions, or scope as needed
   - `findings.md`: record new requirements, technical decisions, or constraints derived from the response
   - `progress.md`: log a new entry noting the questions processing session
4. **Mark response as processed** — add `<!-- Processed -->` below the response in `questions.md`

Rules:

- Never modify the user's response text
- Preserve existing content in all documents except in `plan.md`; append or update, don't overwrite
- Replacing/removing/overwriting in the `plan.md` is permitted
- If a response contradicts a prior decision, update the decision and note the change

## Phase 5: Add follow-up questions

If processing the responses raises new questions or ambiguities:

1. Add new questions to the **bottom** of `questions.md` following the existing template format
2. Continue the existing numbering sequence (e.g. if last question was Q3, new questions start at Q4)
3. Reference the response that prompted the follow-up (e.g. "Follow-up from Q2")
4. Include an empty `### Response` section below each new question

If no follow-up questions are needed, do not add any.

## Phase 6: Report to the user

Provide a concise summary covering:

1. **Responses processed** — list which questions (by number and topic) were processed
2. **Plan changes** — state whether the plan was changed; if yes, briefly describe what changed and in which document(s)
3. **New questions** — if follow-up questions were added, explicitly tell the user:
   - That new questions are waiting in `questions.md`
   - List each new question inline (number and full question text)
   - Ask the user to review and respond to them

If no changes were needed and no new questions arose, say so clearly.
