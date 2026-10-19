# Research documents: local-ai-folders

Each research document is a Markdown file in the current repository.

## Layout

- All research documents live in `{repo root}/.ai/research/`, where `{repo root}` is the root of the current repository
- A document's file is `{yyyy-mm-dd} {topic}.md`, e.g. `.ai/research/2026-04-10 auth-middleware-analysis.md`
- A document's name is its filename without `.md`, e.g. `2026-04-10 auth-middleware-analysis`
- A document's location is the full path to its file
- Documents are stored as the Markdown the skill writes, unchanged

## Operations

### Create a document

Write `{repo root}/.ai/research/{yyyy-mm-dd} {topic}.md`, creating `.ai/research/` first if it does not exist.

### List documents

1. List the `.md` files in `{repo root}/.ai/research/`.
2. If Glob finds nothing, run `ls "{repo root}/.ai/research/"` via Bash, because Glob can fail to list directories on Windows.
3. Sort newest first. The `{yyyy-mm-dd}` prefix sorts correctly as text.

If the directory is missing or has no `.md` files, there are no documents.

### Open or update a document

Read or edit the file at the document's location.
