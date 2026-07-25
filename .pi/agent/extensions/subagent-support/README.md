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
- Added `agent-discovery.js` as a testable helper for agent loading and scope logic; runtime frontmatter parsing delegates to Pi's YAML parser
- Added `model-resolution.js` so agent model aliases are resolved against authenticated providers before spawning subagents
- Added `subagent-result.js` for tested failure classification, diagnostics, and 50 KiB parallel-output truncation
- Added `subagent-process.js` so `agent_settled` completes children even when another extension leaves long-lived resources open
- Synced upstream parallel result output, failure diagnostics, failure-aware status rendering, dynamic config paths, and current imports
- Added local tests and package metadata for this repo-managed extension copy

## File-by-file summary

| File                      | Status                    | Notes                                                                                                   |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `subagent-support.ts`      | Copied, customised | Upstream subprocess execution, current result handling, and `subagent` tool behaviour; retains authenticated model resolution. |
| `agents.ts`                | Customised         | Delegates scope/filesystem discovery to a testable helper and frontmatter parsing to Pi's YAML parser.                         |
| `agent-discovery.js`       | New                | Filesystem helper for user/project discovery, configurable config directories, and parser injection.                          |
| `subagent-result.js`       | New                | Failure classification, diagnostic selection, and 50 KiB parallel-output truncation.                                         |
| `subagent-process.js`      | New                | Completes and terminates settled child processes without waiting on leaked event-loop resources.                              |
| `model-resolution.js`      | New                | Resolves agent model aliases only against authenticated providers, with fallback to Pi defaults.                              |
| `agent-discovery.test.js`  | New                | Covers packaging, CRLF, parser delegation, configurable paths, and discovery behaviour.                                      |
| `subagent-result.test.js`  | New                | Covers subprocess failures, stop reasons, diagnostics, and output truncation.                                                 |
| `subagent-process.test.js` | New                | Covers settled children whose event loops remain busy.                                                                        |
| `model-resolution.test.js` | New                | Covers authenticated-provider-first model alias resolution and fallback behaviour.                                           |
| `package.json`             | New                | Declares the descriptive runtime entrypoint and a Nix-backed test script.                                                     |
| `README.md`                | Customised         | Documents copy installation, omissions, and this repo's customisation choices.                                                |

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
npm test
```
