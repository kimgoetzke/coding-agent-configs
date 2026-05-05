# message-timestamps

Adds timestamps to user submissions and agent responses in the conversation history.

## Visual

User messages — timestamp inside the message box, sharing its `userMessageBg` background:

```
What's the capital of France?

04 May 2026 · 14:30:00
```

Agent responses — timestamp appears after the response:

```
Paris is the capital of France.

04 May 2026 · 14:30:45
```

Both timestamps use the theme's `accent` colour.

## Behaviour

- **User messages**: timestamp prepended via `input` event transform. Skips `/` commands and `!` shell invocations.
- **Agent responses**: timestamp appended via `agent_end` — fires once the full response is received, so the time is accurate. Skips tool-only and thinking-only turns. Only active when a UI is present.
- Old sessions that used `sendMessage`-based injection (custom type `submit-timestamp`) are still rendered correctly via a registered message renderer.
