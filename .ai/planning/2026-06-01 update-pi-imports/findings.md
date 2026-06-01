# Findings

## Plan Size

**Multi-phase: Yes**
Reasoning: 25+ TypeScript source files across 10 extensions need import string changes, plus 2 `package.json` + 2 `package-lock.json` updates and an `npm install` step. Well over 5 files and 5 tool uses.

## Requirements

- Replace all `@mariozechner/*` import specifiers in `.pi/agent/extensions/` with `@earendil-works/*`
- Update `package.json` dependency declarations in extensions that have them
- Regenerate `package-lock.json` (and refresh `node_modules`) for those same extensions
- Verify existing tests still pass after the migration

## Research Findings

- Pi moved to the Earendil Works organisation on 7 May 2026 (first release under new scope: `0.74.0`)
- Old `@mariozechner/*` packages are deprecated but not unpublished; the jiti loader currently has a shim that redirects them, but that shim will not last indefinitely
- Complete package mapping:
  | Old | New |
  |-----|-----|
  | `@mariozechner/pi-coding-agent` | `@earendil-works/pi-coding-agent` |
  | `@mariozechner/pi-agent-core`   | `@earendil-works/pi-agent-core` |
  | `@mariozechner/pi-ai`           | `@earendil-works/pi-ai` |
  | `@mariozechner/pi-tui`          | `@earendil-works/pi-tui` |
  | `@mariozechner/pi-web-ui`       | `@earendil-works/pi-web-ui` |
- Source: https://pi.dev/news/2026/5/7/pi-has-a-new-home

## Scope

Only files tracked in `/home/kgoe/projects/coding-agent-configs` are in scope. Extensions that live only in the home directory Pi config folder (`pi-mcp-adapter`, `usage-statistics`) are **out of scope**.

## Affected Files

### TypeScript source files (import string changes only)

| Extension | File | Old packages used |
|-----------|------|-------------------|
| `active-mode` | `active-mode.ts` | `pi-coding-agent` |
| `command-policy` | `approval-dialog.ts` | `pi-coding-agent`, `pi-tui` |
| `command-policy` | `command-policy.ts` | `pi-coding-agent` |
| `conversation-statusline` | `conversation-statusline.ts` | `pi-coding-agent` |
| `footer-statusline` | `footer-statusline.ts` | `pi-coding-agent` |
| `message-timestamps` | `index.ts` | `pi-coding-agent` |
| `subagent-support` | `agents.ts` | `pi-coding-agent` |
| `subagent-support` | `subagent-support.ts` | `pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui` |
| `web-tools` | `cheap-model.ts` | `pi-ai` |
| `web-tools` | `cheap-model.test.ts` | `pi-ai` |
| `web-tools` | `web-tools.ts` | `pi-coding-agent`, `pi-tui` |
| `web-tools` | `web-tools-registration.test.ts` | `pi-tui` (string literals in test mock) |
| `welcome-hero` | `welcome-hero.ts` | `pi-coding-agent` |

### Package manifests (dependency + lockfile changes)

| Extension | Files | Version pin |
|-----------|-------|-------------|
| `web-tools` | `package.json`, `package-lock.json` | `^0.75.0` |

Note: Extensions without a `package.json` rely on Pi's jiti loader — only source import strings need changing.

## Resources

- Pi new home announcement: https://pi.dev/news/2026/5/7/pi-has-a-new-home
- New GitHub org: https://github.com/earendil-works/pi
- Extensions directory: `/home/kgoe/.pi/agent/extensions/`
