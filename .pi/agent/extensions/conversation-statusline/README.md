# conversation-statusline

Pi extension that shows the current conversation name (the value set with `/name`) in the editor chrome.

## What it does

- Keeps the default thin editor border lines when no conversation name has been set
- Switches the editor border lines to the theme's accent colour when a conversation name exists
- Renders the current conversation name on the right side of the top line with an accent-derived background
- Leaves five trailing dash characters after the name on the far right
- Truncates long names so they fit narrow terminals while keeping a generous left gutter when possible

### Example

```
──────────────────────────────────────────────────────────────────────── my-session-name ─────

──────────────────────────────────────────────────────────────────────────────────────────────
~/projects/coding-agent-configs  main
↑4.8k ↓189 R1k $0.000 (sub)                                   1.9%/264k • gpt-5-mini • minimal
```

## Theme usage

The extension intentionally uses colours from the active Pi theme:

- Unnamed editor line colour: Pi's normal editor border colour
- Named editor line colour: `accent`
- Conversation-name text: `userMessageText`
- Conversation-name background: derived from the theme's `accent` foreground ANSI so the label background matches the accent line colour

## Testing

If `node` is available on your PATH:

```bash
node --test .pi/agent/extensions/conversation-statusline/*.test.js
```

In Nix, you can test with:

```bash
nix shell nixpkgs#nodejs -c node --test .pi/agent/extensions/conversation-statusline/*.test.js
```
