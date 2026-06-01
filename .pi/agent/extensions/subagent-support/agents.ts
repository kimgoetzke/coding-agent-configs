import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { discoverAgentsFromRoots, formatAgentList as formatAgentListFromRoots } from "./agent-discovery.js";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userAgentsDir = path.join(getAgentDir(), "agents");
	return discoverAgentsFromRoots({ cwd, scope, userAgentsDir }) as AgentDiscoveryResult;
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	return formatAgentListFromRoots(agents, maxItems);
}
