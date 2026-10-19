# PR reviews: local-ai-folders

Each review is a markdown file in the current repository.

## Layout

- All reviews live in `{repo root}/.ai/review/`, where `{repo root}` is the root of the current repository
- A review's file is `{yyyy-mm-dd} {pr-number} {pr-title-abbreviated}.md`, e.g. `.ai/review/2026-04-01 42 fix-tenant-resolution.md`
- A review's location is the full path to its file

## Operations

### Find a review by PR number

Use the Glob tool with the pattern `{repo root}/.ai/review/* {pr-number} *.md`. The number is a whole space-delimited field, so a bare `*{pr-number}*` glob would also match dates. In a shell, quote the spaces (`ls "{repo root}/.ai/review/"*" {pr-number} "*.md`); unquoted, the pattern splits and matches every review.

### Create a review

Write the file, creating `.ai/review/` first if it does not exist.

### Update a review

Edit the existing file in place.
