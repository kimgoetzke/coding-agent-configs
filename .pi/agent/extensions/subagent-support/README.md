# Pi subagent-support extension

Project-local copy of Pi's upstream subagent example, packaged so it can be copied into `~/.pi/agent/extensions/subagent-support/` without symlinks.

## Purpose

This extension keeps the upstream `subagent` tool model: it delegates work to isolated `pi` subprocesses so each sub-agent gets its own context window.

The extension package is named `subagent-support` for clarity and to distinguish this repo-managed copy from the upstream example.

## What was copied from the upstream example

- `subagent-support.ts` — copied from the upstream `index.ts` and now serves as the primary runtime entrypoint
- `agents.ts` — the agent discovery entrypoint shape used by the runtime implementation

## What is customised here

- Packaged under `.pi/agent/extensions/subagent-support/` for copy-based installation
- No symlink-based setup instructions
- No bundled sample agents in `agents/*.md`
- No bundled prompt templates in `prompts/*.md`
- Added `agent-discovery.js` as a small testable helper for agent loading logic
- Added `model-resolution.js` so agent model aliases are resolved against authenticated providers before spawning subagents
- Added local tests and package metadata for this repo-managed extension copy

## File-by-file summary

| File                      | Status                    | Notes                                                                                                   |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `subagent-support.ts`     | Copied, lightly annotated | Upstream subprocess execution and `subagent` tool behavior retained; primary runtime entrypoint.        |
| `agents.ts`               | Customised                | Keeps the upstream export shape, but delegates discovery to a testable helper and Pi's `getAgentDir()`. |
| `agent-discovery.js`      | New                       | Pure filesystem helper used to test and preserve project/user agent discovery behavior.                 |
| `model-resolution.js`     | New                       | Resolves agent model aliases only against authenticated providers, with fallback to Pi defaults.        |
| `agent-discovery.test.js` | New                       | Covers copy-based packaging expectations and external agent discovery behavior.                         |
| `model-resolution.test.js`| New                       | Covers authenticated-provider-first model alias resolution and fallback behavior.                        |
| `package.json`            | New                       | Declares the descriptive runtime entrypoint and a Nix-backed test script.                               |
| `README.md`               | Customised                | Documents copy installation, omissions, and this repo's customisation choices.                          |

## Agent locations

This extension intentionally relies on Pi's normal agent locations instead of bundling the example agents:

- User agents: `~/.pi/agent/agents/*.md`
- Project agents: nearest `.pi/agents/*.md`

Project agents are only used when `agentScope` is set to `"project"` or `"both"`.

## Installation

Copy this folder into your global Pi config:

```bash
mkdir -p ~/.pi/agent/extensions
cp -R .pi/agent/extensions/subagent-support ~/.pi/agent/extensions/subagent-support
```

Copy any agents you have into `~/.pi/agent/agents`.

Then reload Pi:

```text
/reload
```

## Testing

Run from this directory:

```bash
nix shell nixpkgs#nodejs --command node --test *.test.js
```
