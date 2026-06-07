# welcome-hero

Pi extension that renders a themed welcome widget above the editor on startup, showing the Pi logo, the active model and provider, and a summary of loaded context files, skills, extensions, and prompt templates.

## Example

On session start the widget appears above the input field:

```
╭────────────────────────────────────────┬─────────────────────────────────╮
│                                        │                                 │
│ ██████    Welcome!                     │ Loaded                          │
│ ██  ██                                 │ ✓ 3 context files               │
│ ████  ██  claude-sonnet-4-6            │ ✓ 18 skills                     │
│ ██    ██  anthropic                    │ ✓ 9 extensions                  │
│                                        │ ✓ 0 prompts                     │
│                                        │                                 │
╰────────────────────────────────────────┴─────────────────────────────────╯
```

The widget is dismissed automatically when the agent starts its first response.

## What it does

- On `session_start` (startup only, not `/reload`): discovers loaded counts and registers a widget via `ctx.ui.setWidget` placed `aboveEditor`
- Left column: 4-row Pi logo (block characters) with "Welcome!", a blank line, model ID, and provider
- Right column: "Loaded" heading with tick-prefixed counts for context files, skills, extensions, and prompt templates
- On `before_agent_start`: removes the widget so it doesn't persist into the conversation
- Adapts to terminal width; returns no output if the terminal is too narrow to render meaningfully

## Theme tokens used

`borderAccent`, `accent`, `mdCode`, `warning`, `dim`, `success`, `text`

## Discovery logic

| Count            | Source                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Context files    | Checks for `AGENTS.md` at `~/.pi/agent/`, `~/.claude/`, project root, `.pi/`, and `.claude/`              |
| Skills           | Pi-reported command count filtered to `source === "skill"`                                                |
| Extensions       | Counts subdirectories and `.ts`/`.js` files in `~/.pi/agent/extensions/` and `.pi/extensions/`            |
| Prompt templates | Counts `.md` files recursively in `~/.pi/agent/commands/`, `~/.claude/commands/`, and project equivalents |

## Testing

Run from the root directory with `node` on the PATH:

```bash
node --test .pi/agent/extensions/conversation-statusline/*.test.js
```

Run from extension directory in Nix:

```bash
nix shell nixpkgs#nodejs -c node --experimental-strip-types --test *.test.ts
```
