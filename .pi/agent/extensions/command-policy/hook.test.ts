import { describe, expect, it, vi } from "vitest";

import { handleBashCommandPolicy } from "./hook";

describe("handleBashCommandPolicy", () => {
  it("returns a non-retry block reason for blocked commands", async () => {
    const result = await handleBashCommandPolicy(
      "git push --force origin main",
      { cwd: "/tmp/project", hasUI: true },
      {
        loadPolicy: () => ({
          kind: "loaded",
          sourcePath: "/tmp/project/.pi/command-policy.json5",
          policy: {
            version: 1,
            block: [
              {
                kind: "block",
                match: "git push --force*",
                note: "Force-pushes are never allowed here. Create a new branch or use a normal push.",
                pattern: /^git push --force.*$/,
              },
            ],
            confirm: [],
          },
        }),
      },
    );

    expect(result).toEqual({
      block: true,
      reason:
        'Blocked by command policy: matched block rule "git push --force*" for atomic command "git push --force origin main". Retrying the same command unchanged will fail again. Use a different approach. Guidance: Force-pushes are never allowed here. Create a new branch or use a normal push.',
    });
  });

  it("prompts for confirm rules and allows execution when approved", async () => {
    const confirm = vi.fn(async () => true);

    const result = await handleBashCommandPolicy(
      "kubectl delete pod api-123",
      { cwd: "/tmp/project", hasUI: true },
      {
        loadPolicy: () => ({
          kind: "loaded",
          sourcePath: "/tmp/project/.pi/command-policy.json5",
          policy: {
            version: 1,
            block: [],
            confirm: [
              {
                kind: "confirm",
                match: "kubectl delete *",
                note: "Double-check cluster, namespace, and target before continuing.",
                pattern: /^kubectl delete .*$/,
              },
            ],
          },
        }),
        confirm,
      },
    );

    expect(result).toBeUndefined();
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]?.[0]).toEqual({
      fullCommand: "kubectl delete pod api-123",
      ruleMatch: "kubectl delete *",
      atomicCommand: "kubectl delete pod api-123",
      note: "Double-check cluster, namespace, and target before continuing.",
    });
  });

  it("blocks confirm rules when no UI is available", async () => {
    const result = await handleBashCommandPolicy(
      "sudo systemctl restart nginx",
      { cwd: "/tmp/project", hasUI: false },
      {
        loadPolicy: () => ({
          kind: "loaded",
          sourcePath: "/tmp/project/.pi/command-policy.json5",
          policy: {
            version: 1,
            block: [],
            confirm: [
              {
                kind: "confirm",
                match: "sudo *",
                note: "Check whether elevated privileges are truly necessary.",
                pattern: /^sudo .*$/,
              },
            ],
          },
        }),
      },
    );

    expect(result).toEqual({
      block: true,
      reason:
        'Command requires approval by command policy: matched confirm rule "sudo *" for atomic command "sudo systemctl restart nginx", but approval UI is unavailable in this mode. Do not retry the same command unchanged. Approval hint: Check whether elevated privileges are truly necessary.',
    });
  });
});
