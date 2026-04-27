# My Personal Coding Agent Config Files

This repository contains a collection of configuration files for coding agents.

> [!NOTE]
> Once you have copied over the skills in this repository, you can always use `/update-skills` to fetch the latest skills from this repository, iterate through each new or changes one (ignoring local-only skills), showing you the change and asking you if you wish to update it.

## How to use

### Quick setup

Run one of the commands below to automatically install all skills, agents, and config files for your coding agent. The script will prompt before overwriting any existing config files.

**Claude Code:**

```bash
curl -fsSL https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.sh | bash -s -- --claude
```

**GitHub Copilot:**

```bash
curl -fsSL https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.sh | bash -s -- --copilot
```

This will not install any hooks for you though. Browse `/hooks` to see if you need any of them. Each hook contains setup instructions.

### Manual setup

If you prefer to set things up by hand:

- Copy the files relevant for your agent from the root of this repository to your home folder
  - Example: `.copilot` -> `~/.copilot`
- Copy the entire `skills` folder from the root of this repository into your agent config folder
  - Example: `skills` -> `~/.copilot/skills`
  - Agents pick up skills automatically on startup or when prompted to reload them
- Review the `hooks` folder from the root of this repository and pick any hooks you like
  - The files inside the `hooks` folder have comments explaining how to use them
  - The scripts from the `hooks` folder should be copied into `~/{agent}/hooks`
- Start your coding agent and use the `/skills` command to confirm the skills are being recognised
  - Claude Code also has a `/hooks` command
