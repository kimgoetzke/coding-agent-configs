# PR reviews: local-ai-folders

Each review is a Markdown file in the current repository, with its metadata as YAML frontmatter.

## Layout

- All reviews live in `{repo root}/.ai/review/`, where `{repo root}` is the root of the current repository
- A review's file is `{yyyy-mm-dd} {pr-number} {pr-title-abbreviated}.md`, e.g. `.ai/review/2026-04-01 42 fix-tenant-resolution.md`
- A review's location is the full path to its file
- The file starts with the review metadata as YAML frontmatter, every value a double-quoted string, in the order the skill lists the fields. The Markdown review body follows unchanged:

```markdown
---
pr_number: "42"
pr_title: "Fix tenant resolution"
...
last_reviewed_commit: "abc1234"
---

# PR Review: Fix tenant resolution (#42)
```

## Operations

### Find a review by PR number

Use the Glob tool with the pattern `{repo root}/.ai/review/* {pr-number} *.md`. The number is a whole space-delimited field, so a bare `*{pr-number}*` glob would also match dates. In a shell, quote the spaces (`ls "{repo root}/.ai/review/"*" {pr-number} "*.md`); unquoted, the pattern splits and matches every review.

### Read or write metadata

Read or edit the frontmatter fields at the top of the file. Leave fields you are not changing as they are; add a missing field in the order the skill lists the fields.

### Create a review

Write the file, creating `.ai/review/` first if it does not exist.

### Update a review

Edit the existing file in place.
