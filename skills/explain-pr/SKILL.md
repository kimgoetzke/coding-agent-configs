---
name: explain-pr
description: Walk a user through a GitHub pull request to help them understand what it does, using markdown visualisations and a guided diff-by-diff tour. Use when the user wants to understand, explore, learn from, or be walked through a PR (not when they want a formal review).
argument-hint: [PR number or URL | 'html' PR number or URL | empty for current branch]
disable-model-invocation: true
---

# Explain PR

You are tasked with helping the user *understand* a GitHub pull request, not review it. The goal is comprehension through visualisation and a structured, interactive tour of the diffs. You do not produce a review document. You do not score dimensions. You guide the user.

## Step 1: Resolve the PR and detect mode

Verify `gh` is available with `gh --version`. If missing, tell the user this skill needs GitHub CLI and stop.

**Detect the mode:**

- If any argument equals `html` (case-insensitive), set `mode = html`. The remaining arguments (if any) identify the PR.
- Otherwise, set `mode = interactive`.

**Resolve the PR identifier from the remaining arguments:**

- If a PR number or URL was provided:
  - If the URL points to a different repository, tell the user to switch to that repo and rerun, then stop.
  - Otherwise, extract the PR number.
- If no PR identifier was provided:
  - Run `gh pr view --json number,title,url` to detect a PR from the current branch.
  - If none, stop and ask the user for a PR number or URL.

Fetch metadata and diff:

```bash
gh pr view {number} --json number,title,url,body,author,headRefName,baseRefName,headRefOid,state,additions,deletions,changedFiles,files
gh pr diff {number}
```

**Build the permalink prefix** for later use:

- Parse `{owner}/{repo}` from the PR URL (`https://github.com/{owner}/{repo}/pull/{number}`).
- Read `{head_sha}` from `headRefOid`.
- Permalink for any file in this PR is:

  ```
  https://github.com/{owner}/{repo}/blob/{head_sha}/{file path}
  ```

Use these permalinks **everywhere a file path is mentioned to the user** — scope listings, walkthrough plan stops, stop headings, HTML output — so the user can click straight to the pinned source.

## Step 2: Build the introduction

In **interactive** mode: produce a single markdown message with these four sections, in order. Be ruthlessly concise.

In **html** mode: produce the same content but capture it for later substitution into the template (see Step 7). Do not print it to the user.

### 1. PR description & goal

- Quote the PR description **verbatim** in a blockquote (use the `body` field). If empty, say so.
- Below it, add a one-line **Goal** in your own words. One sentence maximum.

### 2. Plain-language summary

- 2-4 sentences describing the change in the most non-technical language feasible.
- Use analogies where they fit. Assume the reader knows the product but not the code.

### 3. Context

- Bulleted list, max 5 bullets, max one line each.
- Cover only what the user needs to understand the change: what subsystem is being touched, what existed before, why this change exists if discernible.

### 4. Visualisations

Output is rendered in a terminal, so use only monospace-friendly visualisations. **Never any rendered diagram format.** Pick whichever of the following help most. Aim for 1-3, not all of them.

- **Before/after table** for behavioural changes (columns: Aspect | Before | After)
- **Indented file tree** grouping changed files by role, annotated with `(new)` / `(modified)` / `(deleted)`:

  ```
  controller/
  ├── OrderController.java        (modified)
  └── dto/CreateOrderRequest.java (new)
  service/
  └── OrderService.java           (modified)
  ```

- **Linear ASCII flow** for request/data flow changes, using Unicode box-drawing characters and arrows (`──►`, `│`, `▼`). Strongly prefer this over any other visualisations unless it makes no sense at all. Annotate new or changed nodes inline:

  ```
  Client ──► OrderController ──► OrderService ──► OrderRepository ──► DB
                  │                    │
                  ▼                   ▼
            CreateOrderRequest   DomainEvent (new)
  ```

- **Numbered interaction list** for sequence-style interactions (use indentation for nested calls).
- **Transition table** for state machine changes (columns: From | Event | To | Notes).
- **Labelled-list** for new types and their relationships (one type per heading, fields and relationships as bullets).

Keep every visual under ~20 lines. If a flow doesn't fit, split it or fall back to a table.

## Step 3: Decide the scope

In **interactive** mode: follow the procedure below and confirm scoping with the user.

In **html** mode: follow the same procedure but **do not ask the user**. Make the call yourself and document it in the rendered output (the Scope section of the template).

Before designing walkthrough plans, decide whether the walk should cover **every** changed file or only the **essence**.

Most large PRs have a small essence — a few files that contain the real change — surrounded by mechanical churn (renames, generated code, mass formatting, repetitive call-site updates, lockfile changes, snapshot updates, etc.). The agent's job here is to make that distinction explicit.

Procedure:

1. Classify every changed file into one of two buckets:
   - **Essence**: files where the actual behaviour, logic, or design change lives.
   - **Mechanical**: files that exist only to support the change but add no comprehension value (generated code, lockfiles, snapshots, mass renames, repetitive call-site updates, formatting-only diffs, etc.).
2. **If the mechanical bucket is empty** (or contains only one or two trivial files): the walk will cover everything. This is a no-op — say nothing to the user, skip to Step 4.
3. **If the mechanical bucket is non-trivial**: announce the scoping with a short message of the form:

   > This PR touches {N} files but the essence is in {M}. I'll focus the walk on those and skip the rest.
   >
   > **Excluded files ({count}):**
   >
   > - [`path/to/file.ext`]({permalink}) — generated
   > - [`path/to/another.ext`]({permalink}) — repetitive call-site update
   > - …

   Show the **full list** of excluded files with a short reason for each. Wrap each path in a markdown link to its permalink. Do not truncate. Group by reason where it aids readability.
4. Ask the user whether they are happy with this scoping. If they want any excluded file pulled back in, move it to the essence bucket. If they want a file dropped, move it out. Then proceed to Step 4.

Only files in the essence bucket become stops in the walkthrough plans.

## Step 4: Propose walkthrough plans

In **interactive** mode: present plans to the user and let them pick.

In **html** mode: design the same plans, then **choose the best one yourself**. The chosen plan drives the walkthrough; the others are still listed in the rendered output for reference.

Analyse the diff and design **1-3 walkthrough plans**. Each plan is a linear ordered sequence of "stops" through the diff that tells a coherent story. Examples:

- *Endpoint-first*: request DTO -> controller -> service -> repository -> migration -> tests
- *Domain-first*: domain model -> service rules -> persistence -> wiring -> tests
- *Outside-in*: tests describing behaviour -> implementation that satisfies them -> wiring
- *File-order*: simply the diff in the order GitHub shows it (offer only if no better narrative exists)

Each plan should:

- Have a short name (3-5 words)
- Have a one-line description
- List its stops in order, each stop labelled with the file(s) — or the segment of a file (see below) — it covers (wrap each file path in a markdown link to its permalink)

### Splitting large or complex files into multiple stops

One file does not always mean one stop. A file with a large or multi-themed change deserves **several** stops, each covering part of it, so the explanation tracks the change instead of collapsing hundreds of lines into a sentence or two.

For each **essence** file, decide whether to split it. Split when any of these hold:

- the file's changed-line count (additions + deletions) exceeds ~60, or
- the file has 4 or more hunks, or
- the hunks address clearly distinct concerns (e.g. a new interface in one place and three unrelated call-site rewrites elsewhere).

When you split a file, divide its diff into **segments**. A segment is one or more *consecutive* `@@` hunks that share a single theme. Group hunks by concern — read them and cluster related hunks rather than slicing mechanically by line count. Give each segment a short title (3-5 words) and order the segments to tell a coherent story (usually top-to-bottom through the file; reorder only if a later hunk explains an earlier one).

Each stop then covers exactly one of:

- one or more whole files (small, single-theme files), or
- a single segment of one split file.

Do not mix whole-file and segment coverage in one stop, and never put segments from two different files in the same stop. A split file therefore contributes as many stops as it has segments, each with its own title, framing, and diff.

Present plans to the user:

- **Claude Code**: use the `AskUserQuestion` tool with each plan as an option. Include the stop list in each option's `description`.
- **Other agents**: present a numbered list and ask the user to reply with the number.

Call this menu the **walkthrough plan** in all user-facing text.

## Step 5: Walk the diffs

This step runs in **interactive** mode only. In **html** mode, skip to Step 7.

Once the user picks a plan, walk through its stops in order. For each stop:

1. Print a heading: `## Stop {n}/{total}: {short stop title}` (for a segment stop, use the segment title; the file recurs across its segments, so the title is what distinguishes them).
2. On the next line, list the file(s) covered as markdown links to their permalinks (e.g. `Files: [`src/Foo.java`]({permalink}), [`src/Bar.java`]({permalink})`). For a segment stop, name the file once and note which part it is (e.g. `File: [`src/Foo.java`]({permalink}) — validation hunks`).
3. One sentence framing what this stop (or segment) shows and why it comes here in the sequence.
4. Show the **verbatim diff** for this stop in a fenced ```diff block. Slice it from the full diff fetched in Step 1 — split on lines matching `^diff --git a/.* b/.*` and pick the section(s) for the file(s) at this stop. If the stop covers a **segment** of a split file (see Step 4), slice that file's section further to only the segment's hunks: a hunk runs from a `@@ … @@` line up to (but not including) the next `@@` line or the end of the file's section, and the `@@` header stays with its hunk. Do not paraphrase the diff.
5. Stop and present the four numbered choices below.

Choices to offer after every stop (always in this order):

- **1) Ask questions** — free-flowing chat about anything in this stop or earlier
- **2) Review-style commentary** — give your honest take on the code at this stop only (correctness, naming, edge cases, etc.). Make it clear this is not the full review skill.
- **3) Continue to next stop**
- **4) Back to the walkthrough plan** — return to Step 4 so the user can pick a different plan

Presentation rules:

- **Claude Code**: use `AskUserQuestion` with these four labelled options.
- **Other agents**: present a numbered list (`1) … 2) … 3) … 4) …`) and wait for a number.

After **1)** or **2)**, when the user is done, re-present the same four choices.

If the user picks **4)**, jump back to Step 4 and re-offer the plans (you may add a new plan if you have learned something during the walk).

When the user picks **3)** on the final stop, proceed to Step 6.

## Step 6: Recap and hand-off

This step runs in **interactive** mode only. In **html** mode, skip to Step 7.

Print a short recap:

- A `## Recap` heading
- 3-6 bullets capturing the key points the walk surfaced (one bullet per stop is fine, but tighten where possible)
- Any open questions the user asked that were not fully resolved

Then offer to run the formal review:

> Want me to run `/review-pr {number}` for a structured red-amber-green review?

If they accept, invoke the `review-pr` skill with the PR number. If they decline, stop.

## Step 7: Render the HTML document

This step runs in **html** mode only.

By the end of Step 4 you have: PR metadata, the four intro sections (description+goal, plain-language summary, context, visualisations), the scope decision (essence vs excluded files), and the set of walkthrough plans with one marked as chosen.

For every stop in the chosen plan, slice the file's diff from the full PR diff fetched in Step 1 — split on lines matching `^diff --git a/.* b/.*` and pick the section(s) for the file(s) at this stop.

Then load the template at `{skill dir}/templates/explain-pr.html.tmpl` and substitute the placeholders below. Output to:

```
{repo root}/.ai/review/{yyyy-mm-dd} {pr-number} {pr-title-abbreviated}.html
```

Where `{pr-title-abbreviated}` is the PR title in kebab-case, truncated to a max of 50 characters at a word boundary. Create `.ai/review/` if it doesn't exist. If a file with that name already exists, overwrite it.

### Placeholders

| Placeholder              | Value                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `{{NUMBER}}`             | PR number                                                                              |
| `{{TITLE}}`              | PR title (HTML-escaped)                                                                |
| `{{URL}}`                | PR URL                                                                                 |
| `{{AUTHOR}}`             | PR author login                                                                        |
| `{{HEAD_BRANCH}}`        | Source branch                                                                          |
| `{{BASE_BRANCH}}`        | Target branch                                                                          |
| `{{GENERATED_AT}}`       | Local time, format `YYYY-MM-DD HH:MM TZ`                                               |
| `{{PR_BODY_HTML}}`       | PR body rendered to HTML (paragraphs, lists, code). HTML-escape any raw text.          |
| `{{GOAL}}`               | One-sentence goal in your own words (HTML-escaped)                                     |
| `{{SUMMARY_HTML}}`       | The plain-language summary as one or more `<p>` elements                               |
| `{{CONTEXT_HTML}}`       | Context bullets as a `<ul>`                                                            |
| `{{VISUALISATIONS_HTML}}`| Visualisations as `<table>`, `<pre>`, etc. (see below)                                 |
| `{{SCOPE_SECTION_HTML}}` | Scope section markup, or empty string if mechanical bucket was empty (see below)       |
| `{{PLANS_HTML}}`         | Markup for plans block (see below)                                                     |
| `{{WALK_HTML}}`          | Markup for the chosen plan's stops with diffs (see below)                              |
| `{{RECAP_HTML}}`         | 3-6 recap bullets as a `<ul>`                                                          |

### Visualisations in HTML

Use the same visualisation types as Step 2.4 but emit native HTML:

- Tables → `<table><thead>…</thead><tbody>…</tbody></table>`
- Indented file trees, ASCII flows, numbered interaction lists → `<pre>…</pre>` (preserve whitespace exactly)
- Labelled lists → `<h4>` per type with `<ul>` of fields and relationships

No Mermaid or other rendered diagram formats — `<pre>` blocks render correctly in any browser.

### Scope section

If the mechanical bucket from Step 3 is empty, set `{{SCOPE_SECTION_HTML}}` to an empty string.

Otherwise emit (wrap every `<code>{path}</code>` in an `<a href="{permalink}">…</a>`):

```html
<section id="scope">
  <h2>Scope</h2>
  <p>This PR touches {N} files but the essence is in {M}. The walk focuses on those and skips the rest.</p>
  <details>
    <summary>Excluded files ({count})</summary>
    <ul>
      <li><a href="{permalink}"><code>{path}</code></a> — {reason}</li>
      ...
    </ul>
  </details>
</section>
```

### Plans block

```html
<p>Chosen for this document: <span class="badge chosen">{chosen plan name}</span> — {chosen plan description}</p>
<details>
  <summary>All candidate plans ({count})</summary>
  <ul>
    <li><strong>{plan name}</strong> — {description}
      <ol>
        <li>{stop title} — <a href="{permalink}"><code>{file path}</code></a></li>
        ...
      </ol>
    </li>
    ...
  </ul>
</details>
```

If only one plan was designed, omit the `<details>` block and just show the chosen-plan badge line.

### Walkthrough stops

One `<section class="stop">` per stop in the chosen plan. Inside each stop, emit **one `<details class="diff-wrapper">` per file** for a whole-file stop, or **one `<details>` for the segment** for a segment stop (see Step 4). Never put more than one file — or more than one segment — in a single `<details>`. This gives natural visual separation, lets the user expand only what they care about, and avoids confusion about where one diff ends and the next begins.

Because a split file contributes several stops, each segment lands in its own `<section class="stop">` with its own heading, framing, and diff — exactly like any other stop. The file's permalink recurs across those sections; the segment title is what tells them apart.

Every `<details>` stays **closed by default** so large PRs feel less intimidating.

The `<summary>` shows the file as a permalink plus an additions/deletions count. For a segment stop, add a `<span class="diff-seg">` with the segment title so the user can tell which part of the file it is:

```html
<!-- whole-file stop -->
<section class="stop" id="stop-{n}">
  <h3>Stop {n}/{total}: {stop title}</h3>
  <p class="stop-frame">{one-sentence framing}</p>

  <details class="diff-wrapper">
    <summary><a href="{permalink}"><code>{file path}</code></a> <span class="diff-stats">+{additions} −{deletions}</span></summary>
    <pre class="diff"><code>{wrapped diff lines for this file}</code></pre>
  </details>
  ...
</section>

<!-- segment stop (one of several for the same split file) -->
<section class="stop" id="stop-{n}">
  <h3>Stop {n}/{total}: {segment title}</h3>
  <p class="stop-frame">{one-sentence framing of this segment}</p>

  <details class="diff-wrapper">
    <summary><a href="{permalink}"><code>{file path}</code></a> <span class="diff-seg">{segment title}</span> <span class="diff-stats">+{additions} −{deletions}</span></summary>
    <pre class="diff"><code>{wrapped diff lines for this segment's hunks only}</code></pre>
  </details>
</section>
```

Slice a segment's hunks exactly as in Step 5: a hunk runs from a `@@ … @@` line up to (but not including) the next `@@` line or the end of the file's section, and the `@@` header stays with its hunk. As a refinement, point the segment's permalink at the changed lines by appending a line anchor for the new-file side — `#L{start}` (or `#L{start}-L{end}`), where `{start}` is the new-file start line from the segment's first `@@ -a,b +start,len @@` header and `{end}` is `start + len − 1` of its last hunk.

Count `{additions}` and `{deletions}` over **only the lines in that `<details>`** — the file's slice for a whole-file stop, or the segment's hunks for a segment stop: additions are lines starting with `+` (excluding `+++`), deletions are lines starting with `-` (excluding `---`).

### Diff line wrapping

**First, drop every file-header line from the slice** — any line starting with `diff --git`, `index `, `--- `, or `+++ `. These only repeat the file path, which the `<summary>` already shows as a clickable permalink, so they add noise and nothing else. The rendered diff starts at the first `@@` hunk header.

For each remaining line of the per-file diff slice, wrap it in a `<span class="line ...">` element. HTML-escape the line content (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`). Concatenate all spans inside the `<pre class="diff"><code>...</code></pre>`. No line breaks between spans — each span has `display: block` via CSS.

Classify the remaining lines by their leading characters:

| Leading characters | Class               | Notes                                  |
| ------------------ | ------------------- | -------------------------------------- |
| `@@`               | `line hunk`         | Hunk header                            |
| `+` (not `+++`)    | `line add`          | Addition                               |
| `-` (not `---`)    | `line del`          | Deletion                               |
| Any other          | `line`              | Context                                |

Example:

```html
<span class="line hunk">@@ -10,7 +10,9 @@ public class OrderController {</span><span class="line"> public ResponseEntity&lt;Order&gt; create() {</span><span class="line del">-    return ResponseEntity.ok(service.createDefault());</span><span class="line add">+    return ResponseEntity.ok(service.create(request));</span>
```

### After writing

Print one line to the user with the absolute path of the file you created. Do not offer `/review-pr` and do not print any of the document content.

## Important notes

- This is a *teaching* skill, not a reviewing skill. Resist the urge to flag issues unless the user picks option **2)**.
- Always show diffs verbatim. Never paraphrase code.
- Keep prose tight. The visualisations and diffs do the heavy lifting.
- Never modify the PR branch. Never push. Never post comments on the PR.
- Only handle PRs in the current repository — reject cross-repo URLs.
