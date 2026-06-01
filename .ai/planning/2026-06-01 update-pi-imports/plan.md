# Plan: Update Pi imports from @mariozechner to @earendil-works

## Goal

Replace all `@mariozechner/*` import specifiers across every extension tracked in this repo (`.pi/agent/extensions/`) with their `@earendil-works/*` equivalents, and update the `web-tools` package manifest.

## User Prompt

Pi has moved from the `@mariozechner` npm scope to `@earendil-works`. All extensions under `/home/kgoe/projects/coding-agent-configs/.pi/agent/extensions/` reference the old scope. Every `@mariozechner/*` import string in `.ts` source files must be updated to the new scope. The `web-tools` extension carries its own `package.json` and needs its lockfile regenerated with `@earendil-works/pi-ai` pinned to `^0.75.0`.

Scope is limited to files tracked in this repository. Extensions that live only in the home directory Pi config folder (`pi-mcp-adapter`, `usage-statistics`) are out of scope and must not be touched.

## Status

Complete

## Work

### Phase 1: Update TypeScript source imports

Update all 13 TypeScript source files across the 8 in-repo extensions to replace `@mariozechner/` with `@earendil-works/` in every import, type-import, and string literal.

- [x] Read the relevant skills for this phase before editing any file: (no language-specific skill needed — straightforward string replacement)
- [x] Update `active-mode/active-mode.ts`
- [x] Update `command-policy/approval-dialog.ts`
- [x] Update `command-policy/command-policy.ts`
- [x] Update `conversation-statusline/conversation-statusline.ts`
- [x] Update `footer-statusline/footer-statusline.ts`
- [x] Update `message-timestamps/index.ts`
- [x] Update `subagent-support/agents.ts`
- [x] Update `subagent-support/subagent-support.ts`
- [x] Update `web-tools/cheap-model.ts`
- [x] Update `web-tools/cheap-model.test.ts`
- [x] Update `web-tools/web-tools.ts`
- [x] Update `web-tools/web-tools-registration.test.ts` (string literals in test mock, not just imports)
- [x] Update `welcome-hero/welcome-hero.ts`
- [x] Update `plan.md` and `findings.md` in line with the `planning` skill
- **Status:** Complete

### Phase 2: Update web-tools package manifest and lockfile

Update `web-tools/package.json` to declare `@earendil-works/pi-ai` pinned to `^0.75.0`, then run `npm install` to regenerate the lockfile and `node_modules`.

- [x] Read the relevant skills for this phase before editing any file: (none applicable)
- [x] Update `web-tools/package.json`: replace `@mariozechner/pi-ai` → `@earendil-works/pi-ai` at `^0.75.0`
- [x] Run `npm install` inside `web-tools/` to regenerate `package-lock.json` and `node_modules`
- [x] Confirm no remaining `@mariozechner` references in `web-tools/package-lock.json`
- [x] Update `plan.md` and `findings.md` in line with the `planning` skill
- **Status:** Complete

### Phase 3: Verify

Run existing tests to confirm nothing is broken after the migration.

- [x] Read the relevant skills for this phase before editing any file: `tdd`
- [x] Run `web-tools` test suite (`web-tools-registration.test.ts`, `cheap-model.test.ts`) — 24/24 pass
- [x] Run tests for any other in-repo extensions that have test files — all pass (active-mode 5/5, command-policy 17/17, conversation-statusline 9/9, footer-statusline 24/24, subagent-support 9/9, welcome-hero 39/39, web-tools misc suites 58/58+)
- [x] Confirm zero remaining `@mariozechner` references across all tracked files (excluding `node_modules`) — confirmed
- [x] Update `plan.md`, `findings.md`, and `progress.md` in line with the `planning` skill
- **Status:** Complete

## Decisions Made

| Decision | Rationale |
| -------- | --------- |
| Keep same import symbol names, only change scope prefix | No API changes between old and new packages — purely a naming migration |
| Update string literals in test mocks (`web-tools-registration.test.ts`) | The mock intercepts by exact specifier string; leaving it as `@mariozechner/pi-tui` would cause the mock to miss the new import |
| Pin `@earendil-works/pi-ai` to `^0.75.0` in `web-tools/package.json` | User explicitly requested pin to 0.75 |
| Regenerate lockfile via `npm install` rather than manual edit | Ensures all transitive deps resolve correctly under the new scope |
| `pi-mcp-adapter` and `usage-statistics` are out of scope | These extensions live only in the home directory Pi config folder, not in this repo — user explicitly excluded them |

## Errors Encountered

| Timestamp | Error | Attempt | Resolution |
| --------- | ----- | ------- | ---------- |
|           |       | 1       |            |

## Notes

- Update `## Status` and phase status as you progress
- Re-read this plan before major decisions (attention manipulation)
- Log ALL errors — they help avoid repetition
