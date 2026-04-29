---
name: persist
description: Store your findings, analysis, or other outcomes on disk for future reference. Use when user asks you to do something that does not explicitly mention planning but clearly does not involve taking action yet e.g. analysing or investigating something.
argument-hint: [topic to persist or empty to summarise the conversation so far]
---

## Core idea

- Context window = RAM (volatile, limited)
- Anything important gets written to disk.

## Workflow

### Step 1: Determine task type

Before doing any work, determine whether the user's request is primarily about **understanding or documenting existing code** in the current repository.

- **If yes** → invoke the `research-codebase` skill instead. Do not continue with this skill.
  - Examples: "how does the auth flow work?", "document the payment service", "explain the middleware chain", "what classes handle X?"
- **If no** → continue with Step 2.
  - Examples: no argument or "analyse this RFC", "summarise the compliance requirements", "investigate options for a new library", "compare approaches for X"

### Step 2: Resolve the argument

**If an argument was provided:**

- Treat it as the topic/subject to persist — use it to derive `{topic}` and proceed to Step 3.

**If no argument was provided:**

- Summarise the conversation since the last persistence event (i.e. since the last invocation of `persist`, `planning`, `planning-mode`, `research-mode`, or any other skill that writes to `.ai/`). If no such event exists, summarise the entire conversation.
- The summary must be structured around **learnings, insights, and decisions** — not a chronological account of what was said. Extract the substance: what was established, what was ruled out, what trade-offs were identified, what conclusions were reached.
- Derive `{topic}` from the subject matter of that conversation segment.
- Use the summary as the content to persist.

### Step 3: Determine output location

Check whether this skill is being invoked within the context of an existing plan (i.e. you are aware of/working on a plan with a folder under `{repo root}/.ai/planning/`).

**Within an existing plan:**

- Store output in `{repo root}/.ai/planning/{existing plan folder}/{yyyy-mm-dd} {topic}.md`
- Example: `.ai/planning/2026-04-09 refactor-auth-flow/2026-04-10 auth-middleware-analysis.md`

**Standalone (no existing plan):**

- Store output at: `{repo root}/.ai/research/{yyyy-mm-dd} {topic}.md`
- Create the `.ai/research/` directory if it doesn't exist
- Example: `.ai/research/2026-04-10 auth-middleware-analysis.md`

Where:

- `{repo root}` is the root of the current repository
- `{yyyy-mm-dd}` is the date of the plan creation
- `{topic}` is an extremely succinct name of the topic in kebab-case

### Step 4: Do the work

Conduct the research, analysis, or investigation the user requested.

### Step 5: Write findings to disk

Create the markdown file containing the outcome of your work (analysis, findings, comparison, etc.).

- Structure the file in whatever way is most appropriate for the task
- Use markdown visualisations (tables, diagrams, lists) where they add clarity
- If you consulted external resources (URLs, API docs, RFCs, etc.), include a **Resources** section at the end of your findings file listing them with brief descriptions

### Step 6: Keep findings current

If you continue investigating or learning new things in this conversation after the initial write:

- Update the research document on disk after each substantive discovery or conclusion
- Don't wait until the conversation ends — write incrementally as you learn
- Add new sections, update existing analysis, or note contradictions as they emerge
- If the document structure no longer fits the findings, restructure it
