# footer-statusline

Pi extension that replaces the built-in footer bar with a more colourful TypeScript version.

## What it changes

### Path row

Before: `~/projects/coding-agent-configs (main) • my-session`  
After: `~/projects/coding-agent-configs   main`

- Git branch shown with a Powerline icon instead of parentheses
- Session name dropped — already visible in the editor chrome's top border via `conversation-statusline`
- Path uses `accent`
- Branch icon + branch name use `syntaxVariable`

### Stats row

Before: everything uniformly dim  
After: each segment uses a semantic theme colour

| Segment                | Colour token                                         |
| ---------------------- | ---------------------------------------------------- |
| `↑` input tokens       | `syntaxNumber`                                       |
| `↓` output tokens      | `success`                                            |
| `R` cache-read tokens  | `muted`                                              |
| `W` cache-write tokens | `muted`                                              |
| cost (`$0.000`)        | `muted`                                              |
| context `%/window`     | `success` when unknown, `muted` < 40 %, `warning` 40–59 %, `error` ≥ 60 % |
| model name             | `warning`                                            |
| `•` separator          | `muted`                                              |
| thinking level value   | `thinkingOff` / `thinkingLow` / `thinkingMedium` / … |

### Suggestion separator

While slash-command suggestions or other editor completions are visible below the input field, the footer adds a horizontal separator line above itself.

- Only shown while completions are visible
- Uses the same `accent` colour as the repo's existing statusline separator lines

### Extension status row

Unchanged from built-in: shows statuses from other extensions, sorted alphabetically.

## Theme tokens used

`accent`, `syntaxNumber`, `syntaxVariable`, `success`, `warning`, `error`, `muted`, `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`

## Files

- `index.ts` — package entry point
- `footer-statusline.ts` — Pi extension wiring for footer rendering and autocomplete tracking
- `footer.ts` — pure footer line composition
- `render.ts` — pure rendering helpers
- `types.ts` — local TypeScript types for the pure footer modules
- `footer.test.ts` — footer composition tests
- `render.test.ts` — helper tests

## Testing

From the extension directory:

```bash
nix shell nixpkgs#nodejs -c node --experimental-strip-types --test *.test.ts
```

Or via the package script:

```bash
nix shell nixpkgs#nodejs -c npm test
```
