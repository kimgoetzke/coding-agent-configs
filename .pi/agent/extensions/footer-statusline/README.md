# footer-statusline

Pi extension that replaces the built-in footer bar with a more colourful, streamlined version.

## What it changes

### Path row

Before: `~/projects/coding-agent-configs (main) • my-session`  
After:  `~/projects/coding-agent-configs  main`

- Git branch shown with a Powerline icon (`` / ``) instead of parentheses
- Session name dropped — already visible in the editor chrome's top border (via the `conversation-statusline` extension)
- Path in `muted`, branch icon + name in `accent`

### Stats row

Before: everything uniformly dim  
After:  each segment uses a semantic theme colour

| Segment | Colour token |
|---------|-------------|
| `↑` input tokens | `accent` |
| `↓` output tokens | `success` |
| `R` cache-read tokens | `muted` |
| `W` cache-write tokens | `muted` |
| cost (`$0.000`) | `muted` |
| context `%/window` | `muted` < 40 %, `warning` 40–59 %, `error` ≥ 60 % |
| model name | `accent` |
| thinking level suffix | `muted` |

### Extension status row

Unchanged from built-in: shows statuses from other extensions (e.g. active-mode) sorted alphabetically.

## Theme tokens used

All tokens are standard Pi semantic tokens present in every theme:
`accent`, `success`, `warning`, `error`, `muted`

## Testing

```bash
/nix/store/pjr8jcds298brhwy1d3rmym9vayxhbfs-nodejs-22.16.0/bin/node --test \
  /home/kgoe/projects/coding-agent-configs/.pi/agent/extensions/footer-statusline/render.test.js
```

Or if `node` is on PATH:

```bash
node --test .pi/agent/extensions/footer-statusline/render.test.js
```

## Files

- `footer-statusline.js` — Pi extension entry point; registers the `session_start` handler and calls `setFooter`
- `render.js` — pure formatting helpers (no Pi dependency; testable in isolation)
- `render.test.js` — Node test-runner tests for `render.js`
