---
name: generate-pr-description
description: Generates a concise pull request description from a PR or the current branch. Use only when explicitly invoked by the user to draft PR text.
argument-hint: [PR number or URL | empty for current branch]
disable-model-invocation: true
---

# Generate PR description

Generate the PR description without wrapping it in a code fence. Never post or edit it unless authorised under **4. Decide whether to update the PR**.

## 1. Establish the change

- If given a PR number or URL, inspect its metadata, commits, and full diff.
- Otherwise, inspect the PR associated with the current branch. If none exists, compare the current branch with the repository's default branch, including committed changes only.
- Read enough surrounding code and documentation to understand behaviour rather than merely restating file changes.
- Derive motivation from reliable context such as the PR, linked issue, commit messages, or repository documentation. Never invent motivation. If it remains unclear, ask one focused question before drafting.

## 2. Select content

### What

Describe outcomes and observable behaviour, not the editing process.

- Use 1–5 bullets; target at most 15 words each.
- Keep one distinct change per bullet and group closely related implementation details.
- Prefer product or user-facing behaviour over file names and implementation mechanics.
- Include internal changes only when they are the substance of the PR or materially affect maintainers.
- Omit tests, formatting, generated files, routine wiring, and incidental refactors from feature or fix PRs.
- If the PR only changes tests, describe those test changes.
- Do not claim behaviour unsupported by the diff.

### Why

Write at most one extremely succinct sentence explaining the problem, need, or motivation. Do not repeat the What section.

### Notes

Omit this section by default. Add it only when critical understanding requires one of:

- stating that something was deliberately not done;
- explaining why something was skipped;
- providing essential context not suitable for What or Why.

Use no more than three succinct bullets. Do not add routine test, deployment, or implementation commentary.

## 3. Output

Use this exact structure, omitting `### Notes` entirely when unnecessary:

```markdown
## Description

### What? What has changed/is the new behaviour?

This PR:

- <succinct change>
- <succinct change>

### Why? Motivation and context

<extremely succinct context>

### Notes

- <succinct critical note>
```

Before responding, remove redundancy, implementation trivia, unsupported claims, and every non-essential word.

## 4. Decide whether to update the PR

If no existing PR was resolved, do not offer an update or create a PR but **stop** instead.

Otherwise, first resolve this decision:

> Are you running in auto mode? **Yes or no.**

Choose **Yes** only when auto mode is explicitly indicated by the current agent or runtime. Never infer it. If its status is unclear, choose **No**.

### If Yes

Update the resolved PR with the generated description without asking for further approval. Auto mode provides authorisation for this update.

### If No

After presenting the description, ask:

> Would you like me to update PR #{number} with this description?

Do not update the PR unless the user then gives explicit authorisation. Invoking this skill, requesting a description, prior approval, or implied approval does not count. If the user declines or does not answer, leave the PR unchanged.

### Updating

Once authorised through either branch:

- Prefer GitHub CLI (`gh`) when available.
- Update only the resolved PR's body, preserving the generated description exactly.
- Use `gh pr edit {number} --body-file {temporary-file}` rather than interpolating the description into shell arguments.
- If `gh` is unavailable, use a safe available GitHub integration. If none locally available, report that the update could not be made.
- Delete any temporary file afterwards.
- Confirm which PR was updated; **never** merge, close, or otherwise modify a PR.
