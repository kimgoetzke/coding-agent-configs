# conversation-statusline

Pi extension that shows the current conversation name (the value set with `/name`) in the editor chrome, inspired by Claude Code.

## What it does

- Keeps the default thin editor border lines when no conversation name has been set
- Switches the editor border lines to the theme's accent colour when a conversation name exists
- Renders the current conversation name on the right side of the top line with an accent-derived background
- Leaves five trailing dash characters after the name on the far right
- Truncates long names so they fit narrow terminals while keeping a generous left gutter when possible

## Theme usage

The extension intentionally uses colours from the active Pi theme:

- Unnamed editor line colour: Pi's normal editor border colour
- Named editor line colour: `accent`
- Conversation-name text: `userMessageText`
- Conversation-name background: derived from the theme's `accent` foreground ANSI so the label background matches the accent line colour

## Limitation

Pi themes do **not** currently expose a dedicated token for an input-status / conversation-title band. This extension therefore derives the label background from the theme's `accent` foreground ANSI rather than relying on a first-class background token.

That keeps the result theme-aware, but it is still an approximation rather than a built-in Claude Code-style chrome API.

## Files

- `conversation-statusline.ts` — Pi extension entry point loaded via `package.json` manifest so startup shows this filename
- `index.ts` — compatibility re-export
- `layout.js` — pure formatting helpers for label layout
- `chrome.js` — safe theme-aware line and label rendering helpers
- `layout.test.js` — Node test coverage for layout behaviour
- `chrome.test.js` — regression tests for thin-line rendering, trailing dashes, and styled label output

## Testing

If `node` is available on your PATH:

```bash
node --test .pi/agent/extensions/conversation-statusline/*.test.js
```

In this Nix environment, the equivalent command used during implementation was:

```bash
/nix/store/785jidgnryzj566s25s3rb262d4g5znb-nodejs-24.14.1/bin/node --test \
  /home/kgoe/projects/coding-agent-configs/.pi/agent/extensions/conversation-statusline/*.test.js
```
