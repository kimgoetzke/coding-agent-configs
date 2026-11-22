# Research documents: Claude Code HTML artifacts

Select with `persistence.research = claude-code-html-artifact`. This requires Claude Code's `Artifact` tool. If it is unavailable, say so and use `local-ai-folder-markdown` instead. If the tool is available but publishing fails, report the failure and offer the local fallback. Never present an unpublished page as saved.

## Format

- Use a title prefixed with `{yyyy-mm-dd} `. Keep the HTML working copy in the session scratchpad, outside the repository.
- Write semantic HTML directly, with headings in order, descriptive links and readable system fonts. Use a centred container about `1100px` wide with responsive padding and wrap tables and code blocks for horizontal scrolling.
- Use `<pre class="mermaid">` for diagrams. Keep any metadata requested by the calling skill in an HTML comment at the top. Escape source excerpts as text; do not add arbitrary scripts or remote assets.
- Omit `<!DOCTYPE>`, `<html>`, `<head>` and `<body>`; the tool adds the page wrapper.

## Operations

- **Create.** Write `{scratchpad}/{yyyy-mm-dd} {topic}.html`. Publish it with `Artifact` using `file_path`, `icon: "notes"` and a one-sentence `description`. Return the URL. The artifact is the stored document; no repository file is created.
- **List.** Call `Artifact` with `action: "list"`, `scope: "mine"` and `limit: 200`. Follow `next_page_token` and keep date-prefixed titles, newest first.
- **Open.** Call `Artifact` with `action: "read"` and the document URL. Use the returned local file as the working copy.
- **Update.** Open the artifact first if it was not opened or published in this session. Edit the working copy and publish with the same `file_path` and, for an artifact opened by URL, its `url`. Omit `icon` on update.
