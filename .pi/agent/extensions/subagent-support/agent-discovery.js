import * as fs from "node:fs";
import * as path from "node:path";

/**
 * @typedef {"user" | "project"} AgentSource
 * @typedef {"user" | "project" | "both"} AgentScope
 *
 * @typedef {{
 *   name: string,
 *   description: string,
 *   tools?: string[],
 *   model?: string,
 *   systemPrompt: string,
 *   source: AgentSource,
 *   filePath: string,
 * }} AgentConfig
 */

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }

  const closingIndex = content.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const rawFrontmatter = content.slice(4, closingIndex);
  const body = content.slice(closingIndex + 5);
  /** @type {Record<string, string>} */
  const frontmatter = {};

  for (const rawLine of rawFrontmatter.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) continue;
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function parseTools(rawTools) {
  if (!rawTools) return undefined;

  const normalized = rawTools.trim();
  const withoutBrackets =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;

  const tools = withoutBrackets
    .split(",")
    .map((tool) => tool.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);

  return tools.length > 0 ? tools : undefined;
}

/**
 * @param {string} dir
 * @param {AgentSource} source
 * @returns {AgentConfig[]}
 */
export function loadAgentsFromDir(dir, source) {
  if (!fs.existsSync(dir)) return [];

  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  /** @type {AgentConfig[]} */
  const agents = [];

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);
    if (!frontmatter.name || !frontmatter.description) continue;

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: parseTools(frontmatter.tools),
      model: frontmatter.model || undefined,
      systemPrompt: body,
      source,
      filePath,
    });
  }

  return agents;
}

function isDirectory(candidatePath) {
  try {
    return fs.statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string} cwd
 * @returns {string | null}
 */
export function findNearestProjectAgentsDir(cwd) {
  let currentDir = cwd;

  while (true) {
    const candidate = path.join(currentDir, ".pi", "agents");
    if (isDirectory(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

/**
 * @param {{ cwd: string, scope: AgentScope, userAgentsDir: string, projectAgentsDir?: string | null }} options
 * @returns {{ agents: AgentConfig[], projectAgentsDir: string | null }}
 */
export function discoverAgentsFromRoots({ cwd, scope, userAgentsDir, projectAgentsDir = findNearestProjectAgentsDir(cwd) }) {
  const userAgents = scope === "project" ? [] : loadAgentsFromDir(userAgentsDir, "user");
  const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

  /** @type {Map<string, AgentConfig>} */
  const agentMap = new Map();

  if (scope === "both") {
    for (const agent of userAgents) agentMap.set(agent.name, agent);
    for (const agent of projectAgents) agentMap.set(agent.name, agent);
  } else if (scope === "user") {
    for (const agent of userAgents) agentMap.set(agent.name, agent);
  } else {
    for (const agent of projectAgents) agentMap.set(agent.name, agent);
  }

  return {
    agents: [...agentMap.values()],
    projectAgentsDir,
  };
}

/**
 * @param {AgentConfig[]} agents
 * @param {number} maxItems
 */
export function formatAgentList(agents, maxItems) {
  if (agents.length === 0) return { text: "none", remaining: 0 };
  const listed = agents.slice(0, maxItems);
  const remaining = agents.length - listed.length;
  return {
    text: listed.map((agent) => `${agent.name} (${agent.source}): ${agent.description}`).join("; "),
    remaining,
  };
}
