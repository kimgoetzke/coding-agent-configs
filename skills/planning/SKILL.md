---
name: planning
description: Planning a change to any codebase. Use when user asks you to plan something instead of taking immediate action.
argument-hint: [the work to plan]
---

# Planning

## Planning folder

- Any plan must be stored in `{repo root}/.ai/planning/{yyyy-mm-dd} {task-name}/` - where:
  - `{repo root}` is the root of the current repository
  - `{yyyy-mm-dd}` is the date of the plan creation
  - `{task-name}` is an extremely succinct name for the task in kebab-case

## Planning files

Use persistent markdown files as your "working memory on disk." Context windows are volatile and limited; anything important gets written to disk.

- For any plan, you must create the following files in the plan folder:
  - **plan.md** — Track work breakdown and progress
  - **questions.md** — Track your questions and the user's responses and vice versa
  - **findings.md** — Store research and discoveries
- For multi-phase plans, you must also create:
  - **progress.md** — Session log and test results
- Before creating the planning files, you must read the starting templates in `./templates/`
- You must use the starting templates when creating or updating planning files to guide the structure and content of these files

| File           | Purpose                             | When to Update      | Scope            |
| -------------- | ----------------------------------- | ------------------- | ---------------- |
| `plan.md`      | Work breakdown, decisions           | After each phase    | All plans        |
| `findings.md`  | Research, discoveries               | Per 2-action rule   | All plans        |
| `questions.md` | Log of questions and user responses | Throughout planning | All plans        |
| `progress.md`  | Session log, test results           | Throughout session  | Multi-phase only |

## Workflow

If you decide or are expected to produce a plan, follow the steps outlined in this section in order.

### Step 1: Research & discover

- Gather requirements from the user's request
- Derive `{task-name}` — an extremely succinct name for the task, use kebab-case e.g. `refactor-mfa-flow`
- Create the plan folder and `findings.md` following the template: [templates/findings.md](./templates/findings.md)
- Explore the codebase to understand the scope of the change
- Document findings in `findings.md` as you go

### Step 2: Determine plan size

Based on your research, explicitly determine whether this is a **multi-phase plan**. A plan is multi-phase if it meets ANY of the following:

- More than 5 files will likely be modified
- More than 5 tool uses are expected
- More than 150 lines of code will change

Document your determination and reasoning at the top of `findings.md` under a `## Plan Size` heading.

### Step 3: Populate planning files

Create the remaining planning files from the templates based on the determination in step 2 (see [Planning files](#planning-files)). Populate `plan.md` with the plan and `questions.md` with any unresolved questions. Keep `questions.md` scaffolded even if you have no questions yet, as they may come up later. For multi-phase plans, also create `progress.md` as a stub — it will be populated during execution.

### Step 4: Respond

- Return a summarised version of the plan to the user
- You must highlight if there are unresolved questions or if the plan is ready for implementation
- Recommend to the user that they rename this conversation:
  - If running in Claude Code or GitHub Copilot, recommend: "You can run `/rename {task-name}` to rename this conversation."
  - Otherwise, recommend: "Consider renaming this conversation to `{task-name}` if your tool supports it."

## Critical rules

### 1. Keep docs up-to-date

- Every plan — single-phase or multi-phase — must conclude with all planning files up-to-date
- For multi-phase plans, this applies at the end of every phase, not just the final one
- The plan must have explicit actions to this effect that specifically refer to this `planning` skill (in each phase, for multi-phase plans)
- When updating planning files, do so in line with the templates for these files

### 2. Reference relevant skills

- During planning, you must check the skills available to you that apply to the work in that phase (e.g. `rust-bevy-standards`, `java-conventions`, `tdd`)
- Each phase must have a task to read the relevant skills, followed by a list of those skills
- Any development work must follow test-driven development practices i.e. you have to use your `tdd` skill for any code you write and task descriptions featuring development work must make this clear
- **Do not edit any file in a phase until you have read every skill listed for that phase**

### 3. The 2-action rule

> "After every 2 view/browser/search operations, IMMEDIATELY save key findings to text files."

This prevents visual/multimodal information from being lost.

### 4. Read before decide

Before major decisions, read the plan file. This keeps goals in your attention window.

### 5. Update after act

After completing any phase:

- Update `## Status` in `plan.md`
- Mark phase status: `In progress` → `Complete`
- Log any errors encountered
- Note files created/modified

### 6. Log ALL errors

Every error goes in `plan.md` (the single home for errors across all planning files). This builds knowledge and prevents repetition.

### 7. Never repeat failures

```
if action_failed:
    next_action != same_action
```

Track what you tried. Mutate the approach.

## The 3-strike error protocol

```
ATTEMPT 1: Diagnose & Fix
  → Read error carefully
  → Identify root cause
  → Apply targeted fix

ATTEMPT 2: Alternative Approach
  → Same error? Try different method
  → Different tool? Different library?
  → NEVER repeat exact same failing action

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Consider updating the plan

AFTER 3 FAILURES: Escalate to User
  → Explain what you tried
  → Share the specific error
  → Ask for guidance
```

## Templates

- [templates/plan.md](./templates/plan.md) — Work breakdown and progress template
- [templates/findings.md](./templates/findings.md) — Research storage template
- [templates/progress.md](./templates/progress.md) — Session logging template
- [templates/questions.md](./templates/questions.md) — Questions and responses template
