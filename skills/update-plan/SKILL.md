---
name: update-plan
description: Updates planning documents created using the planning-mode or planning skill after questions.md has been updated by the user. Supports an interactive `ask` mode that prompts the user for any still-unanswered questions in real-time. Use when user asks to update the plan after answering your questions, or when they want to walk through unanswered questions interactively.
argument-hint: [ask for interactive mode | full or partial folder name | empty]
---

# Update Plan from User Responses

Process user responses in `questions.md` and update all related planning documents accordingly.

## Prerequisites

- A plan must already exist under `{repo root}/.ai/planning/` created by the `planning` or `planning-mode` skills
- For default (non-`ask`) mode: the plan's `questions.md` must contain at least one question with a non-empty `### Response` section
- For `ask` mode: the plan's `questions.md` must contain at least one unprocessed question (with or without a response)

## Argument parsing

The skill takes a single optional argument:

- If the argument is the literal string `ask` (case-insensitive, trimmed) → enable **ask mode** and locate the plan via the Phase 1 strategies below (folder is not specified separately).
- If the argument is anything else → treat it as a folder name (existing behaviour).
- If the argument is empty → no mode flag and no folder; fall through to the Phase 1 strategies.

`ask` is standalone — it cannot be combined with a folder name on the same invocation. If the user needs ask mode against a specific plan in a multi-plan repo, the Phase 1 multi-plan prompt will let them choose.

Throughout the rest of this skill, **ask mode** refers specifically to the case where the argument was `ask`.

## Phase 1: Locate the plan

Resolve the target plan using the first matching strategy:

1. **Context inference** — check your conversation context for a plan folder path from a prior `planning-mode`/`planning` skill invocation in this session. If found, use it directly and confirm with the user (e.g. "Updating plan `2026-03-24 auth refactor` — correct?"). Proceed on confirmation; if the user says no, fall through to the next strategy.
2. **User argument** — if the user provided a non-`ask` argument, resolve it as a folder name against folders inside `{repo root}/.ai/planning/`. (The `ask` keyword is a mode flag, not a folder name — see "Argument parsing" above.)
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

## Phase 3: Identify questions to handle

Scan `questions.md` for unprocessed questions, in document order. A question is "processed" when a `<!-- Processed -->` comment appears directly below its response content; processed questions are always skipped.

What counts as "to handle" depends on the mode:

- **Default mode:** only unprocessed questions with a non-empty `### Response` section. If none exist, tell the user there is nothing to process and stop.
- **Ask mode:** every unprocessed question, whether or not it has a response yet. If no unprocessed questions exist at all, tell the user and stop.

## Phase 4: Process responses and update documents

Iterate the unprocessed questions identified in Phase 3 in document order. For each question, follow the branch that matches the current state.

### Branch A — Question has a non-empty `### Response`

This is the standard processing path (applies to both default mode and ask mode):

1. **Understand the response** — determine what decision, clarification, or constraint the user provided
2. **Assess impact on the plan** — decide whether `plan.md`, `findings.md`, or `progress.md` need updating
3. **Update planning documents** — make targeted edits:
   - `plan.md`: update phases, decisions, key questions, or scope as needed
   - `findings.md`: record new requirements, technical decisions, or constraints derived from the response
   - `progress.md`: log a new entry noting the questions processing session
4. **Mark response as processed** — add `<!-- Processed -->` below the response in `questions.md`

### Branch B — Question has an empty `### Response`, ask mode is ON

Prompt the user interactively, then run Branch A:

1. **Present the question verbatim** — extract the full prose of the question body (everything between the `## Q[N]: ...` heading and the `### Response` heading), excluding HTML comments (`<!-- ... -->`) which are author-notes from the template, not part of the question itself. Pass this prose to the user **without rephrasing**.
2. **Choose the prompt mechanism** — if the question proposes a discrete set of options (heuristic — phrases like "Should we use X, Y, or Z?", "Pick one of: ...", explicit option lists), use the host agent's structured question tool:
   - Claude Code → `AskUserQuestion`
   - GitHub Copilot → `askQuestions`
   - Other agents → use their equivalent structured question tool if available
   - Otherwise (or for open-ended questions) → prompt the user in plain text
3. **Capture the answer**:
   - If the user provides an answer → write it verbatim into `questions.md` under the existing `### Response` heading (do not rephrase, do not editorialise). Then run **Branch A** for this question (process the answer and mark `<!-- Processed -->`).
   - If the user skips/declines/answers with empty text → leave the `### Response` empty, **do not** add `<!-- Processed -->`, and move on to the next question.

### Branch C — Question has an empty `### Response`, ask mode is OFF

Skip the question silently and move on. It remains unprocessed and will be reported in Phase 6 as still-unanswered.

### Rules (apply to all branches)

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
4. **Still-unanswered questions** — at the end of the report, list every unprocessed question whose `### Response` is still empty (number and topic). This applies to **all** invocations of this skill, including default mode (where empty-response questions were skipped) and ask mode (where the user may have declined some questions). If every question has been answered or processed, omit this section.

If no changes were needed and no new questions arose, say so clearly.
