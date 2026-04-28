---
name: review-pr
description: Review a GitHub pull request for correctness, security, observability, test coverage, and conventions. Identify applicable skills, score each review dimension red-amber-green, and produce a structured review saved to disk and presented to the user. Use when user asks to review a PR, check a pull request, or give feedback on changes in a PR.
argument-hint: [PR number/URL or empty to compare current branch to main/master]
---

# Review PR

You are tasked with reviewing a GitHub pull request in the current repository. You will analyse the diff, check for issues across multiple dimensions, identify which skills were used during the review, assign a red-amber-green score to each review dimension, and produce a structured review saved to disk and presented to the user.

## Step 1: Check prerequisites

Verify that the GitHub CLI is available:

- Run `gh --version`
- **If `gh` is not found**: inform the user that `gh` (GitHub CLI) is required for this skill to work as expected and that without it you may not be able to perform the intended review. Ask the user explicitly whether they wish to continue regardless. If they decline, stop.

## Step 2: Resolve the PR

**If an argument was provided** (PR number or URL):

- If the argument is a URL pointing to a different repository, respond with: "This skill only supports reviewing PRs in the current repository. Please switch to the relevant repo and try again." then stop.
- Otherwise, extract the PR number and proceed.

**If no argument was provided:**

- Run `gh pr view --json number,title,url 2>/dev/null` to detect a PR from the current branch.
- If no PR is found, ask the user for a PR number.

Validate the PR exists: `gh pr view {number} --json number,title,headRefName,baseRefName,url,body,author,state`

## Step 3: Gather PR metadata

Run the following to collect metadata:

```bash
gh pr view {number} --json number,title,headRefName,baseRefName,url,body,author,state,commits
```

Also collect:

- Latest commit hash on the PR branch: `gh pr view {number} --json commits --jq '.commits[-1].oid'`
- Current date/time: `date '+%Y-%m-%d %H:%M:%S %Z'`
- Repository name: `basename $(git rev-parse --show-toplevel)`

Store all metadata for use in step 6.

## Step 4: Check for existing review

Determine the output path (see step 6 for naming convention) and check whether a review file for this PR number already exists:

- Search for files matching `{repo root}/.ai/review/*{pr-number}*`

**If an existing review is found:**

- Read the file and extract the `last_reviewed_commit` from the frontmatter
- Get the latest commit on the PR: `gh pr view {number} --json commits --jq '.commits[-1].oid'`
- **If `last_reviewed_commit` equals the latest commit**: inform the user the PR has already been reviewed up to the latest commit. Ask if they want a fresh review anyway. If not, stop.
- **If they differ**: this is a re-review. Note the `last_reviewed_commit` so you can scope the diff in step 5 to only the new changes. You will update the existing file rather than creating a new one.

**If no existing review is found:** proceed normally (new review).

## Step 5: Analyse the diff

**Fetch the diff:**

- New review: `gh pr diff {number}`
- Re-review: `git diff {last_reviewed_commit}..{latest_commit} -- {files in PR}` to get only new changes

**Read project conventions:**

- If they exist, read the repository's CLAUDE.md and AGENT.md for project-specific conventions
- Based on file types in the diff, identify relevant convention skills (e.g. `rust-test-conventions`, `rust-standards`) and read their SKILL.md files for reference
- Keep a list of every skill consulted during the review so it can be included in the output document and final response. This should include `review-pr` itself plus any project-specific convention or review skills used.

**Spawn parallel sub-agents** using the dedicated review agents, each focused on one review dimension:

1. **Correctness & logic** — use the `correctness-reviewer` agent. Pass it the diff.
2. **Security** — use the `security-reviewer` agent. Pass it the diff.
3. **Tests** — use the `test-reviewer` agent. Pass it the diff and any test convention references (e.g. `rust-test-conventions`).
4. **Style & conventions** — use the `conventions-reviewer` agent. Pass it the diff and all project convention references gathered above (CLAUDE.md, AGENT.md, language-specific convention skills).
5. **Observability** — use the `observability-reviewer` agent. Pass it the diff. This agent has basic OTel conventions embedded; also pass any project-specific telemetry conventions found above.

Each sub-agent prompt should include:

- The diff (or relevant portion)
- Any applicable convention references (gathered above)
- A reminder to return findings with file paths, line numbers, severity, and a recommended red-amber-green score with rationale

## Step 6: Score each review dimension

After collecting sub-agent findings, assign a **red-amber-green** score to each review dimension and prepare a short rationale for each score.

Review dimensions to score:

1. Correctness & logic
2. Security
4. Tests
5. Style & conventions
6. Observability

Scoring rules:

- 🔴 **Red**: critical issues are present in that dimension and should block merge
- 🟠 **Amber**: non-critical but meaningful issues are present in that dimension; this includes convention mistakes such as incorrect naming
- 🟢 **Green**: no issues found, or only minor observability issues

Capture these scores for both the review document and the agent's final response to the user.

## Step 7: Write review to disk

**Output location:**

`{repo root}/.ai/review/{yyyy-mm-dd} {pr-number} {pr-title-abbreviated}.md`

Where:

- `{yyyy-mm-dd}` is today's date
- `{pr-number}` is the PR number (e.g. `42`)
- `{pr-title-abbreviated}` is the PR title in kebab-case, truncated to max 50 characters (trim at word boundary)
- If the `.ai/review/` folder does not exist, create it

**For a re-review**, update the existing file rather than creating a new one.

**Document structure:**

```markdown
---
pr_number: "{number}"
pr_title: "{title}"
pr_url: "{url}"
pr_author: "{author}"
pr_branch: "{headRefName}"
base_branch: "{baseRefName}"
repository: "{repo name}"
first_reviewed: "{yyyy-mm-dd HH:MM:SS TZ}"
last_reviewed: "{yyyy-mm-dd HH:MM:SS TZ}"
last_reviewed_commit: "{latest commit hash on PR branch}"
---

# PR Review: {title} (#{number})

## Summary

[2-3 sentence high-level assessment of the PR]

## Review Dimension Scores

| Dimension           | Score                          | Rationale         |
| ------------------- | ------------------------------ | ----------------- |
| Correctness & logic | {🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Security            | {🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Observability       | {🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Tests               | {🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Style & conventions | {🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |

## Skills Used For This Review

- `review-pr`
- `{skill-name}`
- `{skill-name}`

## Review Dimension: Correctness & Logic

[Findings related to bugs, edge cases, error handling, race conditions, or incorrect assumptions]
[Prefix each finding with severity and status: e.g. `🔴 **[New]**`, `🟠 **[Unresolved]**`, `🟢 **[Resolved]**`]
[List most important first.]
[If none: "No correctness or logic issues found."]

## Review Dimension: Security

[Findings related to auth/authz, injection, secret handling, unsafe defaults, or other security risks]
[Prefix each finding with severity and status: e.g. `🔴 **[New]**`, `🟠 **[Unresolved]**`, `🟢 **[Resolved]**`]
[List most important first.]
[If none: "No security issues found."]

## Review Dimension: Tests

[Findings related to missing coverage, missing edge cases, weak assertions, or test quality]
[Prefix each finding with severity and status: e.g. `🔴 **[New]**`, `🟠 **[Unresolved]**`, `🟢 **[Resolved]**`]
[List most important first.]
[If none: "No meaningful test gaps found."]

## Review Dimension: Style & Conventions

[Findings related to naming, structure, patterns, formatting, or project-specific conventions]
[Prefix each finding with severity and status: e.g. `🔴 **[New]**`, `🟠 **[Unresolved]**`, `🟢 **[Resolved]**`]
[List most important first.]
[If none: "No style or convention issues found."]

## Review Dimension: Observability

[Specific telemetry recommendations — spans, attributes, metrics, log lines worth adding]
[Prefix each finding with severity and status: e.g. `🔴 **[New]**`, `🟠 **[Unresolved]**`, `🟢 **[Resolved]**`]
[List most important first.]
[If none: "Telemetry coverage looks adequate."]

## Review History

| Date   | Commit       | Type       | Notes          |
| ------ | ------------ | ---------- | -------------- |
| {date} | {short hash} | New review | Initial review |
```

**For a re-review**, append a new row to the Review History table and update findings:

- Reassess every existing finding that is not already resolved:
  - If the issue has been addressed in the new commits, change its status to `{severity} **[Resolved]**`
  - If the issue persists, change its status from `[New]` to `[Unresolved]`
- Add net-new findings with status `[New]` under each relevant section
- On initial reviews all findings use the `[New]` status tag
- Recalculate dimension scores based on unresolved findings only — resolved findings do not count
- Update the score table and score rationales so they reflect the latest overall state of the PR
- Update the `last_reviewed` and `last_reviewed_commit` frontmatter fields
- Update the `skills_used` list if additional skills were consulted during the re-review
- Do NOT remove previous findings — they serve as a record

## Step 8: Present findings

Present a concise summary to the user:

- Count of findings by severity and by review dimension
- A red-amber-green summary for each review dimension
- The list of skills used for the review
- The most important findings (critical first)
- Path to the review file on disk

Ask if they would like to:

- Discuss any specific finding
- Post review comments on the PR via GitHub

**If the user wants to post comments:**

- Use `gh pr review {number}` with appropriate flags
- Never use `--request-changes`, even when there are critical issues — always use `--comment`
- Include the dimension score summary in the review body you post
- Do not reference the markdown file you created in the local repository because it is not intended to be pushed to the remote repository
- End the review body with a separator and attribution line: `---` followed by `This review was generated by {agent} {model}.` where `{agent}` is the tool being used (e.g. Claude Code, GitHub Copilot) and `{model}` is the model name and version (e.g. Opus 4.6, Sonnet 4.5)
- Confirm with the user before posting

## Important notes

- Only review PRs in the current repository — reject cross-repo URLs
- Never modify the PR branch or push code as part of this skill
- Be constructive — frame findings as questions or suggestions, not demands
- Be sparing with nits — only flag patterns that genuinely matter
- Include file paths and line numbers for every finding
- For re-reviews, focus only on new/changed code since last review
- Follow step ordering strictly: prerequisites -> resolve -> metadata -> check existing -> analyse -> score -> write -> present
