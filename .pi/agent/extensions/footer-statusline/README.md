# footer-statusline

Pi extension that replaces the built-in footer bar with a more colourful TypeScript version.

## Example

```
──────────────────────────────────────────────────────────────────────────────────────────────
/planni
──────────────────────────────────────────────────────────────────────────────────────────────
→ skill:planning       [u] Planning a change to any codebase. Use when user asks you to plan
  skill:planning-mode  [u] Toggle persistent planning mode on/off. When on, hook support can
──────────────────────────────────────────────────────────────────────────────────────────────
~/projects/coding-agent-configs  main
↑4.8k ↓189 R1k $0.000 (sub)                                   1.9%/264k • gpt-5-mini • minimal
```

## Features

- **Coloured horizontal bars**: The colours of the horizontal bars above and below the user input reflect the current thinking level of the model.
- **Path row**:
  - Improved from Pi default with colours and icons.
  - Session name dropped because of `conversation-statusline`.
- **Stats row**: Improved from Pi default with semantic theme colours, new elements, better layout.
- **Suggestion separator**: While slash-command suggestions or other editor completions are visible below the input field, the footer adds a horizontal separator line above itself.
  - Only shown while completions are visible.
  - Uses the same `accent` colour as the repo's existing statusline separator lines.
- **Extension status row**: Unchanged from built-in Pi statusline. Shows statuses from other extensions, sorted alphabetically.

### Stats row

| Segment                | Colour token                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `↑` input tokens       | `syntaxNumber`                                                                                                |
| `↓` output tokens      | `success`                                                                                                     |
| `R` cache-read tokens  | `muted`                                                                                                       |
| `W` cache-write tokens | `muted`                                                                                                       |
| cost (`$0.000`)        | `muted`                                                                                                       |
| context `%/window`     | `text` when unknown, `success` < 30 %, `warning` 30–49 %, `error` ≥ 50 %; shown on the right before the model |
| model name             | `warning`                                                                                                     |
| `•` separator          | `muted`                                                                                                       |
| thinking level value   | `thinkingOff` / `thinkingLow` / `thinkingMedium` / …                                                          |

## Testing with Nix

From the extension directory:

```bash
nix shell nixpkgs#nodejs -c node --experimental-strip-types --test *.test.ts
```

Or via the package script:

```bash
nix shell nixpkgs#nodejs -c npm test
```
