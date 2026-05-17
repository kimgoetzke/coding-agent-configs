# active-mode

Pi extension that improves working with `*-mode` skills by enabling lifecycle behaviours while `/.ai/.active-mode` exists. `*-mode` skills, such as `research-mode`, are skills that prompt the agent to keep certain files on disk up-to-date during a conversation. When a mode is active, it'll be shown to the user.

## What it does

- Clears stale `.ai/.active-mode` flag files on fresh session start
- Skips cleanup on `/reload`
- Injects the relevant mode reminders from reading the `/.ai/.active-mode` flag file before each LLM call via Pi lifecycle events
- Adds a tiny coloured status badge while a mode is active
- Works with the shared flag used by `planning-mode`, `research-mode`, and other `*-mode` skills

## Example

In pending research mode:
```
────────────────────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────────────────────────
~/projects/coding-agent-configs  main
↑137k ↓8.6k R2.0M $0.000 (sub) 18.7%/400k                                      sonnet-4-6 • high
● research · pending
```

**Only the last row is added by this extension.** The rest is only included for reference.

### Notes

- The extension treats `.ai/.active-mode` as the source of truth
- Skills remain responsible for creating, updating, and deleting the flag file
- If the extension is not installed, the skills still fall back to manual discipline

## Testing

Run from the root directory with `node` on the PATH:

```bash
node --test .pi/agent/extensions/conversation-statusline/*.test.js
```

Run from extension directory in Nix:

```bash
nix shell nixpkgs#nodejs -c node --experimental-strip-types --test *.test.ts
```
