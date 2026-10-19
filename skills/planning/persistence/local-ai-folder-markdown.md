# Plans: local-ai-folder-markdown

Each plan is a folder in the current repository, and each planning document is a Markdown file in that folder.

## Layout

- All plans live in `{repo root}/.ai/planning/`, where `{repo root}` is the root of the current repository
- A plan's folder is `{yyyy-mm-dd} {task-name}/`, e.g. `.ai/planning/2026-04-09 refactor-auth-flow/`
- A plan's name is its folder name, exactly as stored
- A plan's location is the full path to its folder
- A planning document is the file `{document name}.md` in the plan folder, e.g. the `plan` document is `.ai/planning/2026-04-09 refactor-auth-flow/plan.md`
- Documents are stored as the Markdown the skill writes, unchanged

## Operations

### Create a plan

Create `{repo root}/.ai/planning/{yyyy-mm-dd} {task-name}/`, creating `.ai/planning/` first if it does not exist.

### List plans

1. List the directories in `{repo root}/.ai/planning/`. Do not read any files inside them.
2. If Glob finds nothing, run `ls "{repo root}/.ai/planning/"` via Bash, because Glob fails to match directories on Windows.
3. Sort newest first. The `{yyyy-mm-dd}` prefix sorts correctly as text.

If the directory is missing or has no plan folders, there are no plans.

### Open a plan

Resolve the plan name to `{repo root}/.ai/planning/{plan name}/`. A document that has no file in the folder does not exist.

### List a plan's documents

List the files in the plan folder. A document's name is its filename without `.md`.

### Read, write or update a document

Read, create or edit `{plan folder}/{document name}.md`.

### Add a dated document to a plan

Write `{plan folder}/{yyyy-mm-dd} {topic}.md`, e.g. `.ai/planning/2026-04-09 refactor-auth-flow/2026-04-10 auth-middleware-analysis.md`.

### Mark a question as processed

In `questions.md`, add `<!-- Processed -->` on its own line directly below the question's response content. A question is processed when this comment follows its response.
