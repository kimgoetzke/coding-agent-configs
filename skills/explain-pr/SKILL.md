---
name: explain-pr
description: Walk a user through a GitHub pull request to help them understand what it does, using markdown visualisations and a guided diff-by-diff tour. Use when the user wants to understand, explore, learn from, or be walked through a PR (not when they want a formal review).
argument-hint: [PR number or URL | empty to use current branch]
disable-model-invocation: true
---

# Explain PR

You are tasked with helping the user *understand* a GitHub pull request, not review it. The goal is comprehension through visualisation and a structured, interactive tour of the diffs. You do not produce a review document. You do not score dimensions. You guide the user.

## Step 1: Resolve the PR

Verify `gh` is available with `gh --version`. If missing, tell the user this skill needs GitHub CLI and stop.

**If an argument was provided** (PR number or URL):

- If it is a URL pointing to a different repository, tell the user to switch to that repo and rerun, then stop.
- Otherwise, extract the PR number.

**If no argument was provided:**

- Run `gh pr view --json number,title,url` to detect a PR from the current branch.
- If none, stop and ask the user for a PR number or URL.

Fetch metadata and diff:

```bash
gh pr view {number} --json number,title,url,body,author,headRefName,baseRefName,state,additions,deletions,changedFiles,files
gh pr diff {number}
```

## Step 2: Build the introduction

Produce a single markdown message with these four sections, in order. Be ruthlessly concise.

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
   > - `path/to/file.ext` — generated
   > - `path/to/another.ext` — repetitive call-site update
   > - …

   Show the **full list** of excluded files with a short reason for each. Do not truncate. Group by reason where it aids readability.
4. Ask the user whether they are happy with this scoping. If they want any excluded file pulled back in, move it to the essence bucket. If they want a file dropped, move it out. Then proceed to Step 4.

Only files in the essence bucket become stops in the walkthrough plans.

## Step 4: Propose walkthrough plans

Analyse the diff and design **1-3 walkthrough plans**. Each plan is a linear ordered sequence of "stops" through the diff that tells a coherent story. Examples:

- *Endpoint-first*: request DTO -> controller -> service -> repository -> migration -> tests
- *Domain-first*: domain model -> service rules -> persistence -> wiring -> tests
- *Outside-in*: tests describing behaviour -> implementation that satisfies them -> wiring
- *File-order*: simply the diff in the order GitHub shows it (offer only if no better narrative exists)

Each plan should:

- Have a short name (3-5 words)
- Have a one-line description
- List its stops in order, each stop labelled with the file(s) it covers

Present plans to the user:

- **Claude Code**: use the `AskUserQuestion` tool with each plan as an option. Include the stop list in each option's `description`.
- **Other agents**: present a numbered list and ask the user to reply with the number.

Call this menu the **walkthrough plan** in all user-facing text.

## Step 5: Walk the diffs

Once the user picks a plan, walk through its stops in order. For each stop:

1. Print a heading: `## Stop {n}/{total}: {short stop title}`
2. One sentence framing what this stop shows and why it comes here in the sequence.
3. Show the **verbatim diff** for the file(s) at this stop in a fenced ```diff block. Use `gh pr diff {number} -- {file path}` or slice from the full diff already fetched. Do not paraphrase the diff.
4. Stop and present the four numbered choices below.

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

Print a short recap:

- A `## Recap` heading
- 3-6 bullets capturing the key points the walk surfaced (one bullet per stop is fine, but tighten where possible)
- Any open questions the user asked that were not fully resolved

Then offer to run the formal review:

> Want me to run `/review-pr {number}` for a structured red-amber-green review?

If they accept, invoke the `review-pr` skill with the PR number. If they decline, stop.

## Important notes

- This is a *teaching* skill, not a reviewing skill. Resist the urge to flag issues unless the user picks option **2)**.
- Always show diffs verbatim. Never paraphrase code.
- Keep prose tight. The visualisations and diffs do the heavy lifting.
- Never modify the PR branch. Never push. Never post comments on the PR.
- Only handle PRs in the current repository — reject cross-repo URLs.
