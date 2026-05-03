import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverAgentsFromRoots, findNearestProjectAgentsDir, loadAgentsFromDir } from "./agent-discovery.js";

const extensionDir = dirname(fileURLToPath(import.meta.url));

function writeAgent(dir, fileName, content) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), content);
}

test("package manifest points at a descriptive runtime entry file", () => {
  const manifest = JSON.parse(readFileSync(join(extensionDir, "package.json"), "utf8"));

  assert.deepEqual(manifest.pi?.extensions, ["./subagent-support.ts"]);
  assert.equal(existsSync(join(extensionDir, "subagent-support.ts")), true);
  assert.equal(existsSync(join(extensionDir, "index.ts")), false);
});

test("README documents copy-based installation instead of symlink setup", () => {
  const readme = readFileSync(join(extensionDir, "README.md"), "utf8");

  assert.equal(readme.includes("cp -R .pi/agent/extensions/subagent-support"), true);
  assert.equal(readme.includes("ln -sf"), false);
});

test("repo-managed extension package omits bundled example agent and prompt directories", () => {
  assert.equal(existsSync(join(extensionDir, "agents")), false);
  assert.equal(existsSync(join(extensionDir, "prompts")), false);
});

test("findNearestProjectAgentsDir walks upward to the closest .pi/agents directory", () => {
  const workspace = mkdtempSync(join(tmpdir(), "subagent-support-nearest-"));
  const repoRoot = join(workspace, "repo");
  const nestedCwd = join(repoRoot, "apps", "api", "src");
  const projectAgentsDir = join(repoRoot, ".pi", "agents");

  mkdirSync(nestedCwd, { recursive: true });
  mkdirSync(projectAgentsDir, { recursive: true });

  assert.equal(findNearestProjectAgentsDir(nestedCwd), projectAgentsDir);
});

test("loadAgentsFromDir ignores markdown files that omit required agent metadata", () => {
  const workspace = mkdtempSync(join(tmpdir(), "subagent-support-invalid-"));
  const dir = join(workspace, "agents");

  writeAgent(dir, "broken.md", `---\nname: broken\n---\nMissing description\n`);
  writeAgent(dir, "valid.md", `---\nname: worker\ndescription: Valid agent\n---\nPrompt\n`);

  const agents = loadAgentsFromDir(dir, "user");

  assert.equal(agents.length, 1);
  assert.equal(agents[0].name, "worker");
});

test("discoverAgentsFromRoots lets the nearest project agent override a user agent with the same name when scope is both", () => {
  const workspace = mkdtempSync(join(tmpdir(), "subagent-support-"));
  const userAgentsDir = join(workspace, "user-agents");
  const projectRoot = join(workspace, "repo");
  const projectAgentsDir = join(projectRoot, ".pi", "agents");
  const nestedCwd = join(projectRoot, "packages", "feature");

  mkdirSync(nestedCwd, { recursive: true });

  writeAgent(
    userAgentsDir,
    "scout.md",
    `---\nname: scout\ndescription: User scout\ntools: read, grep\n---\nUser prompt\n`,
  );
  writeAgent(
    projectAgentsDir,
    "scout.md",
    `---\nname: scout\ndescription: Project scout\nmodel: claude-sonnet-4-5\n---\nProject prompt\n`,
  );

  const result = discoverAgentsFromRoots({
    cwd: nestedCwd,
    scope: "both",
    userAgentsDir,
  });

  assert.equal(result.projectAgentsDir, projectAgentsDir);
  assert.equal(result.agents.length, 1);
  assert.deepEqual(result.agents[0], {
    name: "scout",
    description: "Project scout",
    tools: undefined,
    model: "claude-sonnet-4-5",
    systemPrompt: "Project prompt\n",
    source: "project",
    filePath: join(projectAgentsDir, "scout.md"),
  });
});
