# Plan: [Brief Description]

<!--
  WHAT: This is your roadmap for the entire task. Think of it as your "working memory on disk."
  WHY: After 50+ tool calls, your original goals can get forgotten. This file keeps them fresh.
  WHEN: Populate this file last during the planning process. Update after each phase completes.
-->

## Goal

<!--
  WHAT: One clear sentence describing what you're trying to achieve.
  WHY: This is your north star. Re-reading this keeps you focused on the end state.
  EXAMPLE: "Make GIF loading at least 10x faster, stream frames with progress feedback so the UI never freezes."
-->

[One sentence describing the end state]

## User Prompt

<!--
  WHAT: Your understanding of what the user wants to achieve by executing this plan in your own 
    words, highlighting what is unclear and where you make assumptions to address the lack of clarity. 
    Do not add assumptions you are going to verify with the user via questions.md here, only assumptions
    you believe do not need verification but can lead to a substantially different implementation if 
    misunderstood.
  WHY: Allows you and the user to spot any discrepancies in understanding of the goal.
  WHEN: When first creating this document.
  EXAMPLE:
    "Add a new button with the text "Ask for help" in the top nav bar on signup.tsx that opens the live
     chat. In the absence of styling instructions, I assume the button should use the 
     `default-cta-button` styling from the common library."
-->

[Detailed breakdown of the end state that makes your assumptions explicit]

## Status

<!--
  WHAT: One-line snapshot of where the plan stands.
  WHY: Lets you (and the user) see the state at a glance without reading every phase.
  WHEN: Update as you progress.
  FORMAT:
    Not started
    In progress — Phase 2/3 complete; next: [Phase 3 title]
    Complete
-->

Not started

## Work

<!--
  WHAT: Break your task into logical phases. Each phase must be completable.
  WHY: Breaking work into phases prevents overwhelm and makes progress visible.
  WHEN: Create during planning. Update status after completing each phase: Pending → In progress → Complete
  NOTE: Every plan has at least one phase block. For single-phase plans, use `### [Phase title]` with no
    phase number. For multi-phase plans, use `### Phase [Number]: [Phase title]`.
-->

### Phase [Number]: [Phase title]

<!--
  WHAT: [Describe what this phase accomplishes]
  WHY: [Why this phase is needed]
  WHEN: Create during planning. Update status of a task after completing it.
  NOTE: Add as many phases as needed, tailored to the task. Duplicate this phase block for each additional
    phase needed.
-->

- [ ] Read the relevant skills for this phase before editing any file: `[skill-name]`, `[skill-name]`
- [ ] [Task description]
- [ ] [Task description]
- [ ] Update `plan.md` and `findings.md` (plus `progress.md` if multi-phase) in line with the `planning` skill
- **Status:** Pending
<!--
  STATUS VALUES:
  - Pending: Not started yet
  - In progress: Currently working on this
  - Complete: Finished this phase
-->

## Decisions Made

<!--
  WHAT: Technical and design decisions you've made, with the reasoning behind them.
  WHY: You'll forget why you made choices. This table helps you remember and justify decisions.
  WHEN: Update whenever you make a significant choice (technology, approach, structure).
  EXAMPLE:
    | Use JSON for storage | Simple, human-readable, built-in Python support |
-->

| Decision | Rationale |
| -------- | --------- |
|          |           |

## Errors Encountered

<!--
  WHAT: Every error you encounter, when it happened, what attempt number it was, and how you resolved it.
  WHY: Logging errors prevents repeating the same mistakes. This is critical for learning.
  WHEN: Add immediately when an error occurs, even if you fix it quickly.
  EXAMPLE:
    | 2026-01-15 10:35 | FileNotFoundError | 1 | Check if file exists, create empty list if not |
    | 2026-01-15 10:37 | JSONDecodeError | 2 | Handle empty file case explicitly |
-->

| Timestamp | Error | Attempt | Resolution |
| --------- | ----- | ------- | ---------- |
|           |       | 1       |            |

## Notes

<!--
  REMINDERS:
  - Update phase status as you progress: Pending → In progress → Complete
  - Re-read this plan before major decisions (attention manipulation)
  - Log ALL errors - they help avoid repetition
  - Never repeat a failed action - mutate your approach instead
-->

- Update `## Status` and phase status as you progress
- Re-read this plan before major decisions (attention manipulation)
- Log ALL errors - they help avoid repetition
