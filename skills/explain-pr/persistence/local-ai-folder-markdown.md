# PR explanations: local-ai-folder-markdown

Each explanation is an HTML file in the current repository.

## Write an explanation

Write the rendered HTML to:

```
{repo root}/.ai/review/{yyyy-mm-dd} {pr-number} {pr-title-abbreviated}.html
```

where `{repo root}` is the root of the current repository. Create `.ai/review/` if it does not exist. If a file with that name already exists, overwrite it.

The explanation's location is the absolute path of the file.
