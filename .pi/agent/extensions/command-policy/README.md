# Pi command policy extension

Global Pi extension that intercepts agent-initiated `bash` tool calls and classifies them as:
- allow
- confirm
- block

## Install location

- Extension folder: `~/.pi/agent/extensions/command-policy/`
- Startup entry shown by Pi: `command-policy.ts`
- Preferred project policy: `.pi/command-policy.json5`
- Optional global fallback policy: `~/.pi/agent/command-policy.json5`

If both policy files exist, the project-local file wins.

## Reload

After editing the extension or a project-local policy file, run:

```text
/reload
```

The policy file is read on demand, so command changes should take effect immediately on the next intercepted bash tool call.

## Policy format

```json5
{
  version: 1,

  block: [
    "rm -rf /",
    {
      match: "git push --force*",
      note: "Force-pushes are never allowed here. Create a new branch or use a normal push.",
    },
  ],

  confirm: [
    "sudo *",
    {
      match: "kubectl delete *",
      note: "Double-check cluster, namespace, and target before continuing.",
    },
  ],
}
```

Notes:
- string rules are exact matches after normalization unless they contain `*`
- `*` works like a wildcard inside the normalized atomic command string
- `block` wins over `confirm`
- `block.note` should be remediation guidance
- `confirm.note` should be an approval hint
