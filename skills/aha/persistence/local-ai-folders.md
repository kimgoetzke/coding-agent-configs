# Insights: local-ai-folders

Each insight is a markdown file in the current repository.

## Layout

- All insights live in `{repo root}/.ai/insight/`, where `{repo root}` is the root of the current repository
- An insight's file is `{yyyy-mm-dd} {succinct-description}.md`, e.g. `.ai/insight/2026-06-02 spring-boot-dynamic-properties.md`
- An insight's location is the full path to its file

## Operations

### Create an insight

Write `{repo root}/.ai/insight/{yyyy-mm-dd} {succinct-description}.md`, creating `.ai/insight/` first if it does not exist. If a file with that name already exists, append a short disambiguating suffix to `{succinct-description}`.

### List insights

List every `.md` file in `{repo root}/.ai/insight/`. If the directory is missing or empty, there are no insights.

### Read an insight

Read the file at the insight's location.
