---
name: persist
description: Store your findings, analysis, or other outcomes for future reference. Use when user asks you to do something that does not explicitly mention planning but clearly does not involve taking action yet e.g. analysing or investigating something.
argument-hint: [topic to persist | empty to summarise the conversation so far]
---

## Core idea

- Context window = RAM (volatile, limited)
- Anything important gets persisted.

## Persistence

A persistence implementation decides where and how output is stored. This skill writes to one of two skill groups, decided in Step 3:

| Output                            | Skill group | Implementation file                           |
| --------------------------------- | ----------- | --------------------------------------------- |
| Research documents                | `research`  | `./persistence/{implementation}.md`           |
| Documents inside an existing plan | `plans`     | `../planning/persistence/{implementation}.md` |

Once Step 3 has picked the group, find the setting, replacing `{group}` with `research` or `plans`:

```bash
R="$(git rev-parse --show-toplevel 2>/dev/null)/.ai/config.properties"; { cat "$R" ~/.ai/config.properties | grep '^persistence\.{group}[[:space:]]*=[[:space:]]*[^[:space:]]'; cat "$R" ~/.ai/config.properties | grep '^persistence[[:space:]]*=[[:space:]]*[^[:space:]]'; } 2>/dev/null | head -1 | tr -d ' \t\r'
```

- No output: use `local-ai-folder-markdown`, the default for both skill groups
- `persistence.{group}={value}` or `persistence={value}`: use `{value}`. If the group's implementation file does not exist for `{value}`, tell the user the `{group}` skill group has no `{value}` implementation and use `local-ai-folder-markdown`

Read only that group's implementation file, and follow it whenever this skill creates or updates a document.

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

- Summarise the conversation since the last persistence event (i.e. since the last invocation of `persist`, `planning`, `planning-mode`, `research-mode`, or any other skill that persists output). If no such event exists, summarise the entire conversation.
- The summary must be structured around **learnings, insights, and decisions** — not a chronological account of what was said. Extract the substance: what was established, what was ruled out, what trade-offs were identified, what conclusions were reached.
- Derive `{topic}` from the subject matter of that conversation segment.
- Use the summary as the content to persist.

### Step 3: Determine output location

Check whether this skill is being invoked within the context of an existing plan (i.e. you are aware of/working on a plan created by the `planning` or `planning-mode` skill).

**Within an existing plan:**

- Store output as a dated document `{yyyy-mm-dd} {topic}` in that plan, following the plans implementation (see [Persistence](#persistence))

**Standalone (no existing plan):**

- Store output as a research document `{yyyy-mm-dd} {topic}`, following the research implementation (see [Persistence](#persistence))

Where:

- `{yyyy-mm-dd}` is today's date
- `{topic}` is an extremely succinct name of the topic in kebab-case

### Step 4: Do the work

Conduct the research, analysis, or investigation the user requested.

### Step 5: Persist findings

Create the document containing the outcome of your work (analysis, findings, comparison, etc.). Write the content in Markdown; the persistence implementation decides how it is stored.

- Structure the document in whatever way is most appropriate for the task
- Use visualisations (tables, diagrams, lists) where they add clarity but make sure they are in-lined in the output (e.g. only markdown in .md files)
- If you consulted external resources (URLs, API docs, RFCs, etc.), include a **Resources** section at the end of the document listing them with brief descriptions

### Step 6: Keep findings current

If you continue investigating or learning new things in this conversation after the initial write:

- Update the research document after each substantive discovery or conclusion
- Don't wait until the conversation ends — write incrementally as you learn
- Add new sections, update existing analysis, or note contradictions as they emerge
- If the document structure no longer fits the findings, restructure it
