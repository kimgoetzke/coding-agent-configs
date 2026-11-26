---
name: write-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
argument-hint: [skill to write | empty for interactive mode]
---

# Writing skills

## Process

1. **Gather requirements** - if not provided in the prompt, ask user about:
   - What task/domain does the skill cover?
   - What specific use cases should it handle?
   - Does it need executable scripts or just instructions?
   - Any reference materials to include?
   - Should the agent invoke it on its own, or only the user (see [Invocation](#invocation))?

2. **Draft the skill** - create:
   - SKILL.md with concise instructions
   - Additional reference files, if required
   - Utility scripts if deterministic operations needed

3. **Review with user** - present draft and ask:
   - Does this cover your use cases?
   - Anything missing or unclear?
   - Should any section be more/less detailed?

## Skill structure

```
skill-name/
├── SKILL.md               # Main instructions (required)
├── reference.md           # Detailed docs (if needed)
├── examples.md            # Usage examples (if needed)
├── scripts/               # Scripts (if needed)
│   └── helper-script.sh   # Utility script (if needed)
└── templates/             # Templates (if needed)
    ├── template-1.md
    └── template-2.md
```

## SKILL.md template

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced features

[Link to separate files: See [reference.md](reference.md)]
```

## Description requirements

The description is **the only thing your agent sees** when deciding which skill to load. It's surfaced in the system prompt alongside all other installed skills. Your agent reads these descriptions and picks the relevant skill based on the user's request.

**Goal**: Give your agent just enough info to know:

1. What capability this skill provides
2. When/why to trigger it (specific keywords, contexts, file types)

**Format**:

- Max 1024 chars
- Write in third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"

**Good example**:

```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad example**:

```
Helps with documents.
```

The bad example gives your agent no way to distinguish this from other document skills.

Every word of a description sits in context on every turn, so prune it hard:

- List one trigger per distinct case the skill handles. Synonyms for the same case are one trigger written twice; keep one.
- Leave out detail the body already covers.

## Invocation

Choose who can invoke the skill:

- **Model-invoked** (default): the agent can load it on its own and other skills can reach it. The user can still invoke it by name. The description costs context on every turn, so pick this only when the agent or another skill must reach it unprompted. Write the description for the agent, with triggers, as above.
- **User-invoked**: set `disable-model-invocation: true` in the frontmatter. Only the user typing its name can invoke it, and other skills cannot. It costs no context, but the user has to remember it exists. Write the description for a human: a one-line summary, no trigger list.

Reference that several user-invoked skills need cannot live in any one of them, because none can load another. Put it in a plain file outside the skills and point to it from each skill.

## Writing instructions

- End every step on a condition the agent can check. "Every modified model accounted for" is checkable; "understand the code" is not, and invites the agent to stop early.
- State the behaviour you want. "Write one-line comments" works better than "don't write long comments", because naming the unwanted behaviour primes it. Use a prohibition only as a hard guardrail you cannot phrase positively, and pair it with the positive target.
- Prune before finishing:
  - Delete any sentence the model would follow anyway without being told.
  - Leave anything the agent can look up in one step (`package.json` scripts, config files, `--help` output) to the environment. Record what it cannot find: unwritten conventions, the reason behind a choice, gotchas.
  - Keep each rule in one place. A duplicate costs tokens and goes stale.

## When to add scripts

Add utility scripts when:

- Operation is deterministic (validation, formatting)
- Same code would be generated repeatedly
- Errors need explicit handling

Scripts save tokens and improve reliability vs generated code.

## When to split files

Split into separate files when the skill contains optional elements that don't always apply and don't always need to be read.

For example, a code-review skill could keep its core workflow in `SKILL.md` and store language-specific conventions in `java.md` or `rust.md`, loaded only when reviewing code in that language.

## Review checklist

After drafting, verify:

- [ ] Description includes triggers ("Use when...") if model-invoked, or is a one-line human summary if user-invoked
- [ ] `disable-model-invocation: true` set if only the user should invoke it
- [ ] SKILL.md
- [ ] Every step ends on a checkable condition
- [ ] Instructions state the wanted behaviour, not only what to avoid
- [ ] No sentences the model would follow by default, no restated config or duplicated rules
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep
- [ ] Optional or context-specific content is split into separate files
