import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { classifyCommand, collectAtomicCommands, loadPolicyForCwd } from "./policy";

describe("classifyCommand", () => {
  it("matches an exact block rule after whitespace normalization", () => {
    const result = classifyCommand("  rm   -rf   /  ", {
      version: 1,
      block: ["rm -rf /"],
    });

    expect(result.kind).toBe("block");
    if (result.kind !== "block") {
      throw new Error(`expected block result, got ${result.kind}`);
    }
    expect(result.rule.match).toBe("rm -rf /");
    expect(result.atomicCommand).toBe("rm -rf /");
  });

  it("supports wildcard rules and preserves optional notes", () => {
    const result = classifyCommand("git push --force origin main", {
      version: 1,
      block: [
        {
          match: "git push --force*",
          note: "Force-pushes are never allowed here.",
        },
      ],
    });

    expect(result.kind).toBe("block");
    if (result.kind !== "block") {
      throw new Error(`expected block result, got ${result.kind}`);
    }
    expect(result.rule.match).toBe("git push --force*");
    expect(result.rule.note).toBe("Force-pushes are never allowed here.");
  });

  it("lets block rules win over confirm rules", () => {
    const result = classifyCommand("git push --force origin main", {
      version: 1,
      block: ["git push --force*"],
      confirm: ["git push *"],
    });

    expect(result.kind).toBe("block");
  });
});

describe("collectAtomicCommands", () => {
  it("extracts commands from separators, pipelines, and command substitutions", () => {
    expect(collectAtomicCommands("echo ok ; rm -rf tmp | cat")).toEqual(["echo ok", "rm -rf tmp", "cat"]);
    expect(collectAtomicCommands("echo $(rm -rf /)")).toEqual(["echo $(rm -rf /)", "rm -rf /"]);
  });
});

describe("loadPolicyForCwd", () => {
  it("prefers the project policy file over the global fallback", () => {
    const cwd = mkdtempSync(join(tmpdir(), "command-policy-"));
    const fakeHome = mkdtempSync(join(tmpdir(), "command-policy-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = fakeHome;

    try {
      mkdirSync(join(cwd, ".pi"), { recursive: true });
      mkdirSync(join(fakeHome, ".pi/agent"), { recursive: true });

      writeFileSync(
        join(cwd, ".pi/command-policy.json5"),
        `{
          version: 1,
          block: ["rm *"],
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          confirm: ["sudo *"],
        }`,
      );

      const result = loadPolicyForCwd(cwd);
      expect(result.kind).toBe("loaded");
      if (result.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${result.kind}`);
      }
      expect(result.sourcePath).toBe(join(cwd, ".pi/command-policy.json5"));
      expect(result.policy.block.map((rule) => rule.match)).toEqual(["rm *"]);
      expect(result.policy.confirm).toEqual([]);
    } finally {
      process.env.HOME = previousHome;
    }
  });
});
