# active-mode

Pi extension that gives `/.ai/.active-mode` the same lifecycle behaviour that Claude Code and Copilot get from standalone hooks.

## What it does

- Clears stale `.ai/.active-mode` files on fresh session start
- Skips cleanup on `/reload`
- Injects mode reminders before each LLM call via Pi lifecycle events
- Adds a tiny coloured status badge plus a widget while a mode is active
- Works with the shared flag used by `planning-mode`, `research-mode`, and other `*-mode` skills

## Why this exists

Claude Code and Copilot use `PostToolUse` and `SessionStart` hooks for these reminders. Pi's starter config in this repo uses extensions instead. This extension is the Pi-native equivalent.

## Lifecycle mapping

- Claude/Copilot `SessionStart` → Pi `session_start`
- Claude/Copilot `PostToolUse` → Pi `context` plus `before_agent_start`
- Visible mode banner → Pi `ctx.ui.setStatus()` and `ctx.ui.setWidget()`

## Notes

- The extension treats `.ai/.active-mode` as the source of truth
- Skills remain responsible for creating, updating, and deleting the flag file
- If the extension is not installed, the skills still fall back to manual discipline

## Tests

```bash
nix shell nixpkgs#nodejs --command node --test .pi/agent/extensions/active-mode/*.test.js
```
