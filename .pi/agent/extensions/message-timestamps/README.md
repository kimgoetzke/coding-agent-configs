# message-timestamps

Adds timestamps to user submissions and agent responses in the conversation history.

## Visual

User messages — timestamp appended inside the message box, sharing its `userMessageBg` background:

```
What's the capital of France?

Sent · 04 May 2026 · 14:30:00
```

Agent responses — timestamp appended after the response, including response duration:

```
Paris is the capital of France.

Received · 04 May 2026 · 14:30:15 · Took 15s
```

Both timestamps use the theme's `accent` colour.

## Behaviour

- **User messages**: timestamp appended via `input` event transform. Skips `/` skill invocations (the timestamp would leak into skill args) and `!` shell invocations (the timestamp would be executed as a shell command). Extension commands (`/cmd`) are unaffected — they are matched before the `input` event fires.
- **Agent responses**: timestamp appended via `agent_end` — fires once the full response is received, so the time is accurate. Includes elapsed time since the user submitted. Skips tool-only and thinking-only turns. Only active when a UI is present.
- Old sessions that used `sendMessage`-based injection (custom type `submit-timestamp`) are still rendered correctly via a registered message renderer.
