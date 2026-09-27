# conversation-statusline

Pi extension that shows the current conversation name (the value set with `/name`) in the editor chrome.

## What it does

- Keeps the default thin editor border lines when no conversation name has been set
- Uses a stable, name-derived theme colour for both editor border lines when a conversation name exists; renaming can change the colour, and resuming the same name preserves it
- Renders the current conversation name on the right side of the top line with a matching background and contrasting theme text
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
- Named editor line colour: selected from `accent`, `syntaxNumber`, `success`, `mdLink`, `syntaxVariable`, and `syntaxKeyword` using the conversation name
- Conversation-name text: whichever contrasts better with the selected background, `userMessageText` or the foreground colour derived from the `selectedBg` background (when RGB values are available)
- Conversation-name background: derived from the selected theme colour so it matches the border lines

## Testing

Run from the root directory with `node` on the PATH:

```bash
node --test .pi/agent/extensions/conversation-statusline/*.test.js
```

Run from extension directory in Nix:

```bash
nix shell nixpkgs#nodejs -c node --experimental-strip-types --test *.test.ts
```
