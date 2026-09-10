---
name: wtf
description: Re-explain what the agent is currently asking or reporting to a user who has lost the thread, then drill into the parts they do not understand through a question loop. Use when the user invokes `/wtf`, says they do not follow, asks "what are you on about" or "what does this mean", or otherwise signals they lack the context to answer a question or act on findings.
argument-hint: [empty to explain the latest agent message, or a term, message or topic to explain instead]
---

# WTF

The user has many workstreams. They have come back to this one cold and no longer know what it is about. Your last message (a question you need answered, or findings you presented) made no sense to them. Rebuild their context from the top and then let them steer into whatever is still unclear.

Treat the user as if they last looked at this repository, ticket or document years ago and forgot most of it. They are intelligent and know the product. They do not remember the code, the names or the history.

## Step 0: Pick the subject

- **No argument**: the subject is your most recent substantive message. If that message was a question, the subject is the decision you are asking for. If it was a report, the subject is the finding.
- **Argument given**: the subject is that term, quoted message or topic. Still anchor it in the current workstream.

Do not ask the user what they want explained. That is what they are asking you.

## Step 1: Overview

One message, hard limit of roughly one A4 page (about 45 lines or 400 words, visuals included). Four parts, in order:

1. **Recap paragraph.** Two to four sentences. What you were tasked with, by whom or from where (ticket, PR, message), what the goal is and roughly where you are now. Example: "I was tasked to investigate ticket ITS-123, which reports that some users are logged out after a few minutes. I traced the token refresh flow and found the cause. I now need you to decide how to fix it."
2. **The point.** Two to five sentences in plain language stating what you are trying to communicate. For a question: what the decision is, why it is yours to make, and what happens if it is not made. For findings: what is wrong, where, and what it means for the user.
3. **The aspects.** Break the subject into three to six constituent parts. One line each, in the order a newcomer needs them. Each line names the aspect using the term the codebase or ticket uses, followed by a plain-language gloss. Present them as a visual where one fits: a tree, a flow with box-drawing characters, or a small table. Number them so the user can refer to them.
4. **The question.** Ask which aspect they want more detail on (see [Asking](#asking)).

Example of the aspects part:

```
The refresh flow (why users get logged out):

  Browser ──► 1. Access token ──► 2. Refresh endpoint ──► 3. Session store ──► 4. Expiry rule
              short-lived key    asks for a new key      where sessions      decides when a
              that proves who    when the old one        live on the         session is too
              you are            runs out                server (Redis)      old to renew
```

## Step 2: Drill-down loop

When the user picks an aspect:

1. Print a breadcrumb line so they always know where they are, for example `ITS-123 › Refresh endpoint › Why it fails`.
2. Explain that aspect in plain language, within the same one-page limit. Break it into its own sub-aspects (two to five) using the same shape as Step 1 part 3.
3. Offer what you can go deeper on for this aspect. Typical options, pick the ones that apply:
   - how it works
   - why it matters for the current question or finding
   - where it lives in the code, with paths
   - what happens under each choice you are asking them to make
   - the history, if you know it (when and why it was introduced)
4. Always include a way back out: `Zoom out` (one level up) and `Back to overview` (Step 1). Include `I'm on the same page now` at every level.
5. Ask (see [Asking](#asking)) and repeat.

The free-text answer is part of the design. When the user types something that matches no option, treat it as a new subject at the current level. Explain it with the same shape and re-offer the loop. Never say the input did not match.

## Step 3: Exit

When the user picks `I'm on the same page now` or says so in their own words:

- If the original subject was a question, restate the question in one or two sentences, now in terms the user has just confirmed they understand, and wait for the answer.
- If it was a report, restate the finding and the next step you are proposing in one or two sentences.

Do not restart the loop. Do not summarise the whole conversation.

## Asking

- **Claude Code**: use the `AskUserQuestion` tool. One question, one option per aspect, plus the navigation options from Step 2 part 4. The tool adds a free-text option itself. Put the one-line gloss in each option's description.
- **Other agents**: if you have a built-in tool for asking the user a question with selectable options, use it the same way. Make sure a free-text answer is possible; if the tool has no free-text option of its own, add one labelled `Something else` and ask for detail when it is chosen. Otherwise print a numbered list, end with `Or type anything else you want explained.`, and wait for a reply.

## Language rules

- Explain every technical term at first use, in a bracket or short clause, unless it is obvious without context (like "latency" of an API request). When in doubt, explain.
- Use the names the codebase, ticket or document uses. Grep to confirm a name rather than guessing. Never coin a term and then rely on it. If you must introduce a name, define it in the sentence that introduces it and keep using that exact name.
- Give a location the first time you name a file, class, endpoint, flag or table, so the user can open it.
- Expand acronyms at first use.
- One idea per sentence. Analogies are welcome when they fit and are dropped once the real term is understood.
- No assumptions about what the user remembers. If a fact is needed, state it.

## Visual rules

- Output renders in a terminal. Use box-drawing flows, indented trees, tables and numbered lists. No Mermaid, no images, no artifacts unless the user asks for one.
- Prefer a visual over a paragraph wherever the shape of the problem can be drawn. Keep each visual under about 15 lines.
- Every message fits on one A4 page. Cut detail rather than exceeding it. Detail is what the next loop iteration is for.

## Critical rules

- Never exceed the one-page limit in a single message.
- Never end a message without a question until the user has said they are on the same page.
- Never take action, change code or continue the original task while this skill is active. Only explain.
- Never blame the user for lacking context. No "as I mentioned earlier".
