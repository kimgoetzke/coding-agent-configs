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

  it("preserves output redirections for policy matching", () => {
    expect(collectAtomicCommands("rg foo 2>NUL")).toEqual(["rg foo > NUL"]);
    expect(collectAtomicCommands("rg foo 2>>NUL")).toEqual(["rg foo >> NUL"]);
    expect(collectAtomicCommands("rg foo 2>/dev/null")).toEqual(["rg foo > /dev/null"]);
  });
});

describe("loadPolicyForCwd", () => {
  it("merges the global fallback with the project policy when both exist", () => {
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
      expect(result.policy.confirm.map((rule) => rule.match)).toEqual(["sudo *"]);
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("lets the project policy downgrade matching global block rules to allow", () => {
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
          downgrade: {
            allow: ["python*"],
          },
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          block: ["python*"],
        }`,
      );

      const loaded = loadPolicyForCwd(cwd);
      expect(loaded.kind).toBe("loaded");
      if (loaded.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${loaded.kind}`);
      }

      expect(classifyCommand("python3 -V", loaded.policy).kind).toBe("allow");
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("lets project rules take precedence over global rules at the same severity", () => {
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
          confirm: [{
            match: "pnpm add *",
            note: "Project-local confirmation note.",
          }],
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          confirm: [{
            match: "pnpm add *",
            note: "Global confirmation note.",
          }],
        }`,
      );

      const loaded = loadPolicyForCwd(cwd);
      expect(loaded.kind).toBe("loaded");
      if (loaded.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${loaded.kind}`);
      }

      const decision = classifyCommand("pnpm add zod", loaded.policy);
      expect(decision.kind).toBe("confirm");
      if (decision.kind !== "confirm") {
        throw new Error(`expected confirm decision, got ${decision.kind}`);
      }
      expect(decision.rule.note).toBe("Project-local confirmation note.");
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("lets the project policy downgrade matching global block rules to confirm", () => {
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
          downgrade: {
            confirm: ["pnpm add *"],
          },
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          block: ["pnpm add *"],
        }`,
      );

      const loaded = loadPolicyForCwd(cwd);
      expect(loaded.kind).toBe("loaded");
      if (loaded.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${loaded.kind}`);
      }

      expect(classifyCommand("pnpm add zod", loaded.policy).kind).toBe("confirm");
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("lets the project policy downgrade matching global confirm rules to allow", () => {
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
          downgrade: {
            allow: ["pnpm remove *"],
          },
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          confirm: ["pnpm remove *"],
        }`,
      );

      const loaded = loadPolicyForCwd(cwd);
      expect(loaded.kind).toBe("loaded");
      if (loaded.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${loaded.kind}`);
      }

      expect(classifyCommand("pnpm remove zod", loaded.policy).kind).toBe("allow");
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("does not let direct project confirm rules weaken matching global block rules", () => {
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
          confirm: ["python*"],
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          block: ["python*"],
        }`,
      );

      const loaded = loadPolicyForCwd(cwd);
      expect(loaded.kind).toBe("loaded");
      if (loaded.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${loaded.kind}`);
      }

      expect(classifyCommand("python3 -V", loaded.policy).kind).toBe("block");
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("ignores downgrade entries declared in the global policy", () => {
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
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          block: ["python*"],
          downgrade: {
            allow: ["python*"],
          },
        }`,
      );

      const loaded = loadPolicyForCwd(cwd);
      expect(loaded.kind).toBe("loaded");
      if (loaded.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${loaded.kind}`);
      }

      expect(classifyCommand("python3 -V", loaded.policy).kind).toBe("block");
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("leaves unrelated commands allowed when project and global policies both exist", () => {
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
          confirm: ["pnpm add *"],
          downgrade: {
            allow: ["python*"],
          },
        }`,
      );

      writeFileSync(
        join(fakeHome, ".pi/agent/command-policy.json5"),
        `{
          version: 1,
          block: ["python*"],
          confirm: ["pnpm remove *"],
        }`,
      );

      const loaded = loadPolicyForCwd(cwd);
      expect(loaded.kind).toBe("loaded");
      if (loaded.kind !== "loaded") {
        throw new Error(`expected loaded policy, got ${loaded.kind}`);
      }

      expect(classifyCommand("echo hello", loaded.policy).kind).toBe("allow");
    } finally {
      process.env.HOME = previousHome;
    }
  });
});
