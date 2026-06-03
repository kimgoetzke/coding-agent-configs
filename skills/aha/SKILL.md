---
name: aha
description: Capture aha-moments as durable insight notes under `.ai/insight/`, or quiz the user on past insights to reinforce recall. Use when the user has just learnt something non-obvious (a fix they didn't know, an explanation that clicked, a gotcha discovered) and wants to record it, or when the user invokes `/aha quiz` to be tested on stored insights.
argument-hint: [empty to scan recent context | topic to focus on | `quiz` to start a quiz]
---

# Aha

Capture and revisit insights — the small "I didn't know that" moments that otherwise evaporate.

Three modes, picked by the argument:

| Argument           | Mode                                                                |
| ------------------ | ------------------------------------------------------------------- |
| _(none)_           | Scan recent context, propose insights, record those the user wants  |
| `quiz`             | Quiz the user on existing insights in `.ai/insight/`                |
| anything else      | Treat argument as a topic hint; focus capture on that subject       |

Insights live in `{repo root}/.ai/insight/{yyyy-mm-dd} {succinct-description}.md` — kebab-case description, just like the `planning` skill folder naming.

## Step 0: Resolve the argument

Before doing anything else, classify the invocation argument and pick the mode. Do this explicitly — state the resolution to the user in one short sentence before proceeding.

1. **Trim** leading/trailing whitespace from the argument
2. **Lower-case** the trimmed argument for comparison only (keep the original for use as a topic hint)
3. Classify:
   - **Empty / whitespace only** → Mode 1 (Capture)
   - **Exactly `quiz`** (case-insensitive, no other words) → Mode 3 (Quiz)
   - **Anything else** → Mode 2 (Capture with topic hint); pass the original (un-lowercased) argument through as the hint
4. **Ambiguity guard**: if the argument starts with `quiz ` followed by more text (e.g. `quiz me on spring boot`), treat it as Mode 3 and use the remainder as an optional topic filter for which insights to draw from. If unsure, ask the user which mode they meant before continuing.
5. **Announce**: tell the user which mode was picked, e.g. `Mode: capture (topic hint: "spring boot dynamic properties")`. Then proceed to the matching mode below.

## Mode 1: Capture (no argument)

### Step 1: Scan recent context for insight candidates

Look back through the conversation **since the last `/aha` invocation** in this session (search for prior `aha` skill activity or files written under `.ai/insight/` during this session). If there's no prior invocation, scan the whole conversation.

Identify candidates. A good insight signal is any of the following:

- The agent was tasked by the user to **fix a bug**
- The agent was asked by the user to **explain a concept**
- The agent **corrected a misconception** the user held (e.g. "actually, X works differently than you'd expect because…")
- A **non-obvious gotcha** surfaced — language quirk, framework footgun, ordering dependency, race condition, off-by-one, encoding issue
- A **pattern or idiom** specific to a framework/language/codebase was revealed (e.g. how dynamic application properties work in Spring Boot)
- The user asked "why does X happen?" and the answer involved domain knowledge that isn't obvious from the code
- A **performance characteristic** was surprising (e.g. "this is O(n²) because…")
- The agent pointed out a **subtle invariant** that must be preserved

Ignore noise: routine code edits, things the user already clearly knew, decisions explicitly captured in a plan/ADR, knowledge the agent gathered as part of a non-troubleshooting-/research-related skill invocation (e.g. `/planning`), the agent's own internal reasoning.

### Step 2: Propose each candidate to the user

For each candidate, ask the user whether to record it.

- **If running in Claude Code**: use the `AskUserQuestion` tool with options `Record it`, `Skip`, `Refine first` (one question per candidate, batched in one call only if proposing ≤4).
- **Otherwise**: enumerate candidates as a numbered list and ask the user which to record (e.g. "Reply with the numbers to record, or `none`").

For each candidate present a one-line summary so the user can decide quickly.

If the user picks `Refine first`, ask follow-up questions to sharpen the framing before writing.

### Step 3: Draft and write each confirmed insight

For each confirmed candidate:

1. Read [templates/insight.md](./templates/insight.md)
2. Derive `{succinct-description}` in kebab-case (e.g. `spring-boot-dynamic-properties`, `pg-locks-blocking-vacuum`)
3. Resolve `{repo root}` and create `.ai/insight/` if missing
4. Write the file to `{repo root}/.ai/insight/{yyyy-mm-dd} {succinct-description}.md`
5. Fill every section of the template; omit a section's that would have no body
6. **Make it standalone** — see [Standalone framing](#standalone-framing) below

After writing, report the filenames back to the user.

### Standalone framing

An insight must make sense to a reader who has **no knowledge of the PR, conversation, or task that produced it**. The capture context is not part of the record.

- **Strip context-relative references.** Remove phrases like "in this PR", "the change above", "as we discussed", "the bug we just fixed", "your new method". State the insight in general, timeless terms instead.
- **Don't reference code the reader can't see.** If you mention a symbol, file, or snippet, either inline the relevant code in the `## Example` section or point to it via a permalink / `path:line` ref in `## Permalink`. Never assume the reader can see a diff or the surrounding code.
- **Prefer permalinks over working-tree paths** when the code may move — a `path:line` ref rots; a commit-pinned permalink doesn't.
- **Example code is fine** even if it originated from the PR, provided the snippet is self-contained and illustrates the general point — not "the line you changed".
- **Re-read test**: before writing, re-read the draft as if you'd never seen the conversation. If any sentence only makes sense with that hidden context, rewrite it.

## Mode 2: Capture with topic hint

If the argument is anything other than `quiz`, treat it as a topic hint (e.g. `/aha how dynamic application properties work in Spring Boot`).

- Use the hint to narrow Step 1's scan — only surface candidates relevant to that topic
- If no relevant candidate is found in context, ask the user to provide the substance directly, then draft from their answer
- Otherwise the flow is identical to Mode 1 from Step 2 onwards

## Mode 3: Quiz (`/aha quiz`)

### Step 1: Load all insights

- List every `.md` file under `{repo root}/.ai/insight/`
- If none exist, tell the user and exit
- Shuffle the file list into random order
- Initialise an in-session score: `correct: 0`, `total: 0`

### Step 2: Quiz one insight at a time

For each insight in the shuffled order:

1. Read the file
2. Generate **1-3 multiple-choice questions** depending on insight depth:
   - 1 question for short, single-fact insights
   - 2-3 for richer insights with multiple distinct facts, code, or trade-offs
3. Each question must have exactly **4 options**, one correct, three plausible distractors
4. Distractors must be wrong but believable — not obvious throwaways. Draw from common misconceptions, adjacent concepts, or the kind of mistake the user might actually make.
5. Vary question style across the quiz:
   - "What does X do?"
   - "Why does X happen?"
   - "Which of these would break X?"
   - "What would you change to fix X?"
   - "Given this code snippet, what's the bug?"
6. **Ask via the right tool**:
   - **Claude Code**: `AskUserQuestion` with the 4 options
   - **Otherwise**: print the question and enumerate options `1.`, `2.`, `3.`, `4.`; ask the user to reply with the number
7. After the user answers:
   - Say whether it was correct
   - Briefly explain the correct answer (one or two sentences)
   - Update in-session score and show the running tally e.g. `Score: 3/4`

### Step 3: End of quiz

When all insights are exhausted:

- Report final score
- List any insights the user got wrong, so they know what to revisit
- Do not persist the score to disk

## Critical rules

- **Never write an insight without user confirmation** — always propose first
- **Insights must be standalone** — no reader should need knowledge of the originating PR, conversation, or task to understand them; see [Standalone framing](#standalone-framing)
- **Never overwrite or update an existing insight file (unless asked to)** without explicit user approval; if the description collides, append a short disambiguating suffix
- **Be concise**: the value of an insight note is that it's quickly re-readable later
- **Don't capture project decisions or plans** — those belong in `.ai/planning/` or ADRs, not here
