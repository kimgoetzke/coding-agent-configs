---
name: improve-a-plan
description: Review, criticise and/or test an existing plan with the goal of improving is. Use when user asks you to review or improve a plan.
argument-hint: [full or partial folder name or empty]
---

## Phase 1: Locate the plan

Resolve the target plan using the first matching strategy:

1. **Context inference** — check your conversation context for a plan folder path from a prior `planning-mode` or `planning` skill invocation in this session. If found, use it directly and confirm with the user (e.g. "Improving plan `2026-03-24 auth refactor` — correct?"). Proceed on confirmation; if the user says no, fall through to the next strategy.
2. **User argument** — if the user provided an argument, resolve it as a number or folder name against the folders inside `{repo root}/.ai/planning/` e.g. `{repo root}/.ai/planning/2026-01-20 improve-mfa-flow/`. Do not read the contents of any plan folders until the plan has been resolved.
3. **Single plan** — if only one plan folder exists, select it automatically.
4. **Multiple plans** — list folders newest first in a numbered list and ask the user to choose. Do not read the contents of any plan folder until the plan has been resolved.
5. **No plans** — tell the user no plans were found and suggest creating one with the `planning-mode` or `planning` skill.

## Phase 2: Improve the plan

- If you haven't already, read the planning documents now
- Tell the user that they generally have the following options:

```markdown
1. Adversarial review in a fresh session

Start a new session and ask me to critique the plan with fresh eyes (no bias from having written it).
Something like: "Read the plan in <location of plan> and the findings. Identify assumptions, gaps, and areas likely to break during implementation." A separate session has clean context and is more likely to spot issues than the one that wrote the plan.

2. Dry-run in plan mode

Use Shift+Tab to switch to plan mode, then ask me to walk through the plan as if implementing it — reading the actual
source files, checking types exist, verifying method signatures match what the plan assumes. This surfaces mismatches
between the plan and reality (e.g. a method signature that's slightly different, a missing dependency, a type that
doesn't exist yet).

3. Explicit assumption check

Ask me to list every assumption the plan makes (e.g. about an external API) and verify each one against an actual
source. The findings doc has some of this, but after a lot of back and forth, it may be worth a refresh.
```

- With the above explanation, provide your own assessment of which option will likely be the highest value next step and ask the user if they would like to continue with the current session (yes/no)
- If the user response with yes, give the user the following options to choose from:
  1. Complete an adversarial review
  2. Dry-run the plan
  3. List every assumption and verify it against the actual source(s)
- If no, encourage the user to start a fresh session
- Once you have completed either of the options that can improve a plan
  - You must update `findings.md` and update or create, if it does not exists, `questions.md` with your findings
    - If you are in read-only mode, prompt the user to disable it in order to make these changes
  - The changes you make to `questions.md` should be your findings/concerns/challenges phrased as clarification or decision questions to the user
  - You must encourage the user to review or discuss these findings
  - You must update all other plan documents accordingly, if necessary
