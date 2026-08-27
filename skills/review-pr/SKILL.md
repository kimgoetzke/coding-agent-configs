---
name: review-pr
description: Review a GitHub pull request for correctness, security, observability, test coverage, and conventions. Identify applicable skills, verify and triage sub-agent findings to cut noise, score each review dimension purple-red-amber-green, and produce a structured review saved to disk and presented to the user. Use when user asks to review a PR, check a pull request, or give feedback on changes in a PR.
argument-hint: [PR number or URL | empty to detect the PR for the current branch]
---

# Review PR

Review a GitHub pull request in the current repository, then save the review to disk and present it to the user.

**Two rules that override everything else in this skill:**

- **Never auto-post to GitHub.** Even when running non-interactively or in an "auto" mode, you MUST NOT post review comments to the PR without explicit sign-off from the user. See step 9. The only exception is when the user granted that sign-off up front when invoking the skill (e.g. "review PR 42 and post the comments").
- **Verify before you report.** Sub-agent findings are unverified. Every finding passes through the triage step (step 6) — you confirm it is true and worth raising before it reaches the review. This is how we keep out the noise.

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

Store all metadata for use in step 8.

## Step 4: Check for existing review

Determine the output path (see step 8 for naming convention) and check whether a review file for this PR number already exists:

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

- If they exist, read the repository's agent-instruction files for project-specific conventions, including `CLAUDE.md`, `AGENT.md`, and analogous files such as `.claude/CLAUDE.md`, `.copilot/copilot-instructions.md`, or `.pi/agent/AGENT.md`
- Based on file types in the diff, identify relevant convention skills (e.g. `rust-test-conventions`, `rust-standards`) and read their SKILL.md files for reference
- Keep a list of every skill consulted during the review so it can be included in the output document and final response. This should include `review-pr` itself plus any project-specific convention or review skills used.

**Spawn parallel sub-agents** using the dedicated review agents, each focused on one review dimension:

1. **Correctness & logic** — use the `correctness-reviewer` agent. Pass it the diff.
2. **Security** — use the `security-reviewer` agent. Pass it the diff.
3. **Tests** — use the `test-reviewer` agent. Pass it the diff and any test convention references (e.g. `rust-test-conventions`).
4. **Style & conventions** — use the `conventions-reviewer` agent. Pass it the diff and all project convention references gathered above (for example `CLAUDE.md`, `AGENT.md`, `.copilot/copilot-instructions.md`, `.pi/agent/AGENT.md`, and language-specific convention skills).
5. **Observability** — use the `observability-reviewer` agent. Pass it the diff. This agent has basic OTel conventions embedded; also pass any project-specific telemetry conventions found above.

Each sub-agent prompt should include:

- The diff (or relevant portion)
- Any applicable convention references (gathered above)
- A reminder to return findings with file paths, line numbers, severity, and a recommended score with rationale
- **The evidence rules below, quoted into the prompt.** They are the main defence against speculative findings, so do not paraphrase them away

**Evidence rules for sub-agents** (include these verbatim in every sub-agent prompt):

> Every finding you return MUST carry these three fields on top of the usual ones:
>
> - **Evidence:** the specific code you read that supports the claim, cited as `path:line` — including code outside the diff (callers, callees, config, existing tests). A diff hunk on its own is not evidence that a problem is real; it is only where you started looking.
> - **Trigger:** the concrete input, state, or sequence that makes the problem actually happen, and the wrong outcome it produces. For example "a request with a null `tenantId` reaches `resolve()` and throws an NPE at line 88", not "this could fail if the input is unexpected".
> - **Holds if:** each assumption you could not verify yourself, one bullet apiece, phrased so someone else can check it. Write "nothing — verified in this repo" when there are none.
>
> If you cannot write a specific **Trigger**, you do not have a finding — drop it. Do not report it with a caveat, a hedge, or a low confidence rating. "Might", "could potentially" and "in some cases" with no named case are all signs you are speculating.
>
> Never assume behaviour you have not read. If a claim depends on how a caller, a framework, a library, or a config behaves, go and read it. If you cannot read it (external service, runtime-only behaviour, another repository), that belongs in **Holds if:** — it does not silently become a fact.

Treat every returned finding as an **unverified candidate**. The sub-agents are deliberately sensitive and over-report; you decide what is real in step 6.

## Step 6: Verify and triage findings

The sub-agents are deliberately sensitive and over-report; every finding they return is an **unverified candidate**. Before anything reaches the review document, you (the main agent) verify each candidate and cut the noise. This is the most important step for review quality — a review full of silly or wrong suggestions is worse than a short, sharp one.

For each candidate finding:

1. **Confirm it is true.** Open the referenced file and lines, read the surrounding context, and check the claim actually holds. Common failure modes to catch: the finding misreads the code, the "missing" handling already exists elsewhere, the concern is already covered by a test or a type, or the suggestion contradicts a project convention.
2. **Check the evidence fields.** A finding with no **Trigger**, or with a trigger too vague to reproduce, is speculation — discard it without further work. Do not repair it into a real finding on the sub-agent's behalf; if the concern is genuine you will be able to trace and state the trigger yourself, and then it is your finding, evidenced by your own reading.
3. **Work through the "Holds if" bullets one by one.** Each is a claim you can go and check in the repository. Resolve every one you can:
   - Assumption verified → strike it off.
   - Assumption disproved → discard the finding, its premise is wrong.
   - Assumption unverifiable from the code (depends on production data, an external service, another repository, or the author's intent) → it stays, and the finding becomes **conditional**.
4. **Classify the finding:**
   - **Confirmed** — you traced it in the actual code, and every assumption is resolved. It is stated as a fact.
   - **Conditional** — the mechanism is real and evidenced, but at least one unverifiable assumption remains. It is stated as a question to the author, with the surviving assumptions listed, never as an assertion that the code is broken.
5. **Decide its fate:**
   - **Discard** it if it is false, speculative, already handled, or a trivial nit that does not genuinely matter (be ruthless — most discarded findings will be low-severity ones).
   - **Discard** a conditional finding whose assumption is far-fetched, or whose worst case is minor if it does turn out to hold. Conditional is not a licence to keep a weak finding — the bar is "the author would want to be asked".
   - **Rephrase** it if the underlying concern is real but the wording is vague, overstated, or misdiagnosed. State the real issue plainly and constructively.
   - **Keep** it as-is if it is correct and clearly worth raising.
6. **Assign a final tier** (see the four-tier scale in step 7). The sub-agents only recommended red/amber/green and tend to over-use amber; you make the real call, including whether something is a purple blocker. **A conditional finding is capped at 🟠 amber** — no unverified assumption may block a merge. If a conditional finding would be a blocker were its assumption true, resolve the assumption (ask the user, read more code) rather than raising the tier on a guess.

You may spawn sub-agents to help verify when it is more efficient — for example, one verification agent per dimension, or a single agent to re-check a batch of borderline findings. Give each the specific findings, the diff, and instructions to report back which findings it could confirm against the actual code, which it could not, and why. Ask them to argue **against** each finding rather than for it: the question is "show me this is not a real problem", and a finding survives only when that attempt fails. You remain responsible for the final decision.

Only findings that survive triage proceed to scoring and the review document.

## Step 7: Score each review dimension

After triage, assign a **purple-red-amber-green** score to each review dimension and prepare a short rationale for each score.

Review dimensions to score:

1. Correctness & logic
2. Security
3. Tests
4. Style & conventions
5. Observability

**Four-tier severity scale** (applies to individual findings and to dimension scores):

- 🟣 **Purple (Blocker)**: a fatal issue — the PR must not be merged until it is fixed. Data loss or corruption, a security hole, a crash or broken core path, a breaking change shipped unintentionally. Reserve this for issues that genuinely stop the merge.
- 🔴 **Red (Important)**: a significant issue that should be fixed before merge but is not fatal — a real bug on a non-critical path, a meaningful gap in error handling, a missing test for important behaviour. This is where the more important findings that used to be lumped into amber now live.
- 🟠 **Amber (Minor)**: a real but less important finding — nice to fix, does not block merge. Convention nits such as incorrect naming, small readability improvements, minor observability gaps.
- 🟢 **Green**: no issues found, or only trivial observations.

The dimension score is the highest tier among that dimension's surviving findings. Do not inflate: reserve purple for true blockers, and do not push a genuine minor nit up to red just because it is the only finding. Conditional findings are capped at amber (step 6), so a dimension whose only findings are conditional can never score red or purple.

Capture these scores for both the review document and the agent's final response to the user.

## Step 8: Write review to disk

**Output location:**

`{repo root}/.ai/review/{yyyy-mm-dd} {pr-number} {pr-title-abbreviated}.md`

Where:

- `{yyyy-mm-dd}` is today's date
- `{pr-number}` is the PR number (e.g. `42`)
- `{pr-title-abbreviated}` is the PR title in kebab-case, truncated to max 50 characters (trim at word boundary)
- If the `.ai/review/` folder does not exist, create it

**For a re-review**, update the existing file rather than creating a new one.

**Finding format:**

Every finding starts with its severity emoji and status — `🟣 **[New]**`, `🔴 **[New]**`, `🟠 **[Unresolved]**`, `🟢 **[Resolved]**` — followed by the finding, the `path:line` it sits at, and the suggested fix.

A **confirmed** finding carries no extra marker. State it plainly as a fact and include the trigger, so the author can see the problem for themselves rather than take your word for it:

```markdown
🔴 **[New]** `TenantResolver.java:88` — `resolve()` dereferences `tenantId` without a null check, so a token minted by the legacy issuer (which omits the claim, see `LegacyTokenFactory.java:34`) throws an NPE before the 401 is returned, surfacing as a 500.
```

A **conditional** finding is marked `⚠️ Conditional` and phrased as a question, with the unresolved assumptions listed underneath. Never assert that conditional code is broken:

```markdown
🟠 **[New]** ⚠️ Conditional — `TenantResolver.java:88` — Should `resolve()` guard against a null `tenantId`? It would throw an NPE rather than return a 401.

Holds if:

- The legacy issuer is still minting tokens without the claim (I could not confirm whether it has been decommissioned).
```

Keep the `Holds if:` bullets to the assumptions that genuinely remain open after triage — one or two. If there are more than two, the finding is not understood well enough to raise.

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

| Dimension           | Score                                       | Rationale         |
| ------------------- | ------------------------------------------- | ----------------- |
| Correctness & logic | {🟣 Blocker / 🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Security            | {🟣 Blocker / 🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Observability       | {🟣 Blocker / 🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Tests               | {🟣 Blocker / 🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |
| Style & conventions | {🟣 Blocker / 🔴 Red / 🟠 Amber / 🟢 Green} | {brief rationale} |

## Skills Used For This Review

- `review-pr`
- `{skill-name}`
- `{skill-name}`

## Review Dimension: Correctness & Logic

[Findings related to bugs, edge cases, error handling, race conditions, or incorrect assumptions]
[Use the finding format defined above. List most important first.]
[If none: "No correctness or logic issues found."]

## Review Dimension: Security

[Findings related to auth/authz, injection, secret handling, unsafe defaults, or other security risks]
[Use the finding format defined above. List most important first.]
[If none: "No security issues found."]

## Review Dimension: Tests

[Findings related to missing coverage, missing edge cases, weak assertions, or test quality]
[Use the finding format defined above. List most important first.]
[If none: "No meaningful test gaps found."]

## Review Dimension: Style & Conventions

[Findings related to naming, structure, patterns, formatting, or project-specific conventions]
[Use the finding format defined above. List most important first.]
[If none: "No style or convention issues found."]

## Review Dimension: Observability

[Specific telemetry recommendations — spans, attributes, metrics, log lines worth adding]
[Use the finding format defined above. List most important first.]
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

## Step 9: Present findings

Present a concise summary to the user:

- Count of findings by severity and by review dimension, noting how many are conditional
- A purple-red-amber-green summary for each review dimension
- The list of skills used for the review
- The most important findings (blockers first, then red)
- Path to the review file on disk

Ask if they would like to:

- Discuss any specific finding
- Post review comments on the PR via GitHub

**Posting to GitHub requires explicit user sign-off — no exceptions:**

- Do NOT post anything to the PR unless the user has explicitly asked you to. This holds even when you are running non-interactively or in an "auto" / autonomous mode: writing the review to disk is always allowed, posting to GitHub is not. Producing the review is not permission to publish it.
- The one way this sign-off can be given up front is at invocation — if the user asked for posting when they invoked the skill (e.g. "review PR 42 and post the comments"), that counts as sign-off and you may post without asking again.
- In every other case, stop after presenting and wait for the user to tell you to post. If in doubt, do not post.

**If (and only if) the user has signed off, post the review as inline comments:**

- Post one **inline comment per finding**, anchored to the file and line the finding is actually about
- Only post findings scored 🟣 purple, 🔴 red, or 🟠 amber — 🟢 green findings and trivial observations are never posted, they live only in the review file on disk
- If nothing is amber or worse, post the summary body alone with no inline comments
- Never use `--request-changes`, even when there are blocker or critical issues — the review event is always `COMMENT`

**The review body** is an extremely succinct summary only — a couple of sentences plus the dimension score table. No finding detail; that belongs in the inline comments. Do not reference the markdown file you created in the local repository because it is not intended to be pushed to the remote repository. End the body with a separator and attribution line: `---` followed by `This review was generated by {agent} {model}.` where `{agent}` is the tool being used (e.g. Claude Code, GitHub Copilot, Pi) and `{model}` is the model name and version (e.g. Opus 5, Sonnet 5).

**Each inline comment** starts with the severity emoji and tier (e.g. `🔴 **Red (Important)** — Correctness & logic`), then the finding and suggested fix, in the finding format from step 8. Use a GitHub ```suggestion block where a concrete replacement is obvious — but only for a confirmed finding; never attach a suggestion block to a conditional one, since a one-click fix invites the author to apply a change you are not sure is needed. Conditional findings keep their `⚠️ Conditional` marker, their question phrasing, and their `Holds if:` bullets when posted: the author is the person who can resolve the assumption, so asking them is the point.

**How to post:** `gh pr review` cannot attach inline comments, so use the reviews API with a JSON payload file:

```bash
gh api repos/{owner}/{repo}/pulls/{number}/reviews --input review.json
```

```json
{
  "commit_id": "{latest commit hash on PR branch}",
  "event": "COMMENT",
  "body": "{succinct summary + score table + attribution}",
  "comments": [
    { "path": "src/foo.rs", "line": 42, "side": "RIGHT", "body": "🔴 **Red (Important)** — Correctness & logic\n\n..." },
    { "path": "src/bar.rs", "start_line": 10, "line": 14, "side": "RIGHT", "body": "🟠 **Amber (Minor)** — Style & conventions\n\n..." }
  ]
}
```

- Lines must exist in the PR diff — the API rejects the whole review if any comment points outside it. Check the diff hunks before choosing a line
- Use `"side": "LEFT"` for a comment on a removed line
- If a finding has no sensible anchor in the diff (e.g. "this test file is missing entirely"), fold it into the review body under a short `### Not anchored to a line` heading rather than dropping it
- If the API rejects the payload, fix the offending anchors and retry — do not silently fall back to one big `gh pr review --comment`

## Important notes

- Only review PRs in the current repository — reject cross-repo URLs
- Never modify the PR branch or push code as part of this skill
- Never post review comments to the PR without explicit user sign-off, even in an auto/autonomous mode (see step 9); sign-off given at invocation counts
- Verify every sub-agent finding against the real code before reporting it (step 6) — discard the false and the trivial; a short accurate review beats a long noisy one
- A finding with no concrete trigger is speculation, not a finding — drop it rather than hedging it (steps 5 and 6). Hedged findings are the most expensive kind of noise: they still cost the author a full investigation
- Anything resting on an assumption you could not check is a conditional finding — marked, phrased as a question, `Holds if:` bullets attached, capped at amber, never given a suggestion block
- Be constructive — frame findings as questions or suggestions, not demands
- Be sparing with nits — only flag patterns that genuinely matter
- Include file paths and line numbers for every finding — they double as the anchor for the inline comment posted in step 9
- Posted reviews are inline comments on the relevant lines, amber or worse only; the body is a succinct summary, not a finding dump
- For re-reviews, focus only on new/changed code since last review
- Follow step ordering strictly: prerequisites -> resolve -> metadata -> check existing -> analyse -> verify & triage -> score -> write -> present
