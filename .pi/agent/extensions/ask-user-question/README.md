# Ask user question

Adds the `ask_user_question` tool to Pi. It gives the agent a structured way to ask up to four related questions. Each question has two to four explained options.

## Controls

- `↑`/`↓`: move between answers
- `Enter`: select the highlighted answer
- `c`: select the highlighted answer and add an optional comment
- `1`–`5`: select a numbered row directly
- `Esc` or `Ctrl+C`: stop the tool and return to normal chat

Every question appends **Chat about this** as its final option. Selecting it stops the current agent turn. The user can then discuss the question in normal chat.

## Tool input

```json
{
  "questions": [
    {
      "header": "Scope",
      "question": "Which scope should I implement?",
      "explanation": "The broader option changes two public APIs.",
      "options": [
        {
          "label": "Narrow",
          "description": "Change only the requested path."
        },
        {
          "label": "Broad",
          "description": "Update related paths and both public APIs."
        }
      ]
    }
  ]
}
```

The extension only opens its selector in TUI mode. In RPC, JSON, or print mode it stops the turn and tells the agent to ask in normal chat.

Run `/reload` after installing or changing the extension.
