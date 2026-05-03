import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";

import JSON5 from "json5";

const require = createRequire(import.meta.url);
const parseBash = require("bash-parser") as (input: string) => unknown;

export const POLICY_VERSION = 1;
export const PROJECT_POLICY_PATH = ".pi/command-policy.json5";

export function getGlobalPolicyPath(): string {
  return resolve(homedir(), ".pi/agent/command-policy.json5");
}

export type RuleInput = string | { match: string; note?: string };

export interface PolicyConfig {
  version: 1;
  block?: RuleInput[];
  confirm?: RuleInput[];
}

export interface ResolvedRule {
  kind: "block" | "confirm";
  match: string;
  note?: string;
  pattern: RegExp;
}

export interface ResolvedPolicy {
  version: 1;
  block: ResolvedRule[];
  confirm: ResolvedRule[];
}

export type PolicyLoadResult =
  | { kind: "none" }
  | { kind: "error"; sourcePath: string; error: string }
  | { kind: "loaded"; sourcePath: string; policy: ResolvedPolicy };

export type ClassificationResult =
  | { kind: "allow"; atomicCommands: string[] }
  | {
      kind: "block" | "confirm";
      atomicCommands: string[];
      atomicCommand: string;
      rule: Pick<ResolvedRule, "kind" | "match" | "note">;
    };

export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export function getPolicyPaths(cwd: string): { project: string; global: string } {
  return {
    project: resolve(cwd, PROJECT_POLICY_PATH),
    global: getGlobalPolicyPath(),
  };
}

export function loadPolicyForCwd(cwd: string): PolicyLoadResult {
  const { project, global } = getPolicyPaths(cwd);
  const sourcePath = existsSync(project) ? project : existsSync(global) ? global : undefined;

  if (!sourcePath) {
    return { kind: "none" };
  }

  try {
    const raw = readFileSync(sourcePath, "utf8");
    const parsed = JSON5.parse(raw) as unknown;
    return {
      kind: "loaded",
      sourcePath,
      policy: resolvePolicy(parsed, sourcePath),
    };
  } catch (error) {
    return {
      kind: "error",
      sourcePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function classifyCommand(command: string, policy: PolicyConfig | ResolvedPolicy): ClassificationResult {
  const resolved = isResolvedPolicy(policy) ? policy : resolvePolicy(policy, "<inline>");
  const atomicCommands = collectAtomicCommands(command);

  for (const atomicCommand of atomicCommands) {
    const rule = resolved.block.find((candidate) => candidate.pattern.test(atomicCommand));
    if (rule) {
      return {
        kind: "block",
        atomicCommands,
        atomicCommand,
        rule: pickRule(rule),
      };
    }
  }

  for (const atomicCommand of atomicCommands) {
    const rule = resolved.confirm.find((candidate) => candidate.pattern.test(atomicCommand));
    if (rule) {
      return {
        kind: "confirm",
        atomicCommands,
        atomicCommand,
        rule: pickRule(rule),
      };
    }
  }

  return { kind: "allow", atomicCommands };
}

export function collectAtomicCommands(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) return [];

  try {
    const ast = parseBash(trimmed);
    const collected: string[] = [];
    visitNode(ast, collected);
    return uniqueNormalized(collected.length > 0 ? collected : [trimmed]);
  } catch {
    return uniqueNormalized([trimmed]);
  }
}

function resolvePolicy(input: unknown, sourcePath: string): ResolvedPolicy {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} must contain an object.`);
  }

  const policy = input as Partial<PolicyConfig>;
  if (policy.version !== POLICY_VERSION) {
    throw new Error(`Policy file ${sourcePath} must set version: ${POLICY_VERSION}.`);
  }

  return {
    version: POLICY_VERSION,
    block: resolveRules(policy.block, "block", sourcePath),
    confirm: resolveRules(policy.confirm, "confirm", sourcePath),
  };
}

function resolveRules(input: RuleInput[] | undefined, kind: "block" | "confirm", sourcePath: string): ResolvedRule[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` must be an array.`);
  }

  return input.map((rule, index) => resolveRule(rule, kind, sourcePath, index));
}

function resolveRule(
  input: RuleInput,
  kind: "block" | "confirm",
  sourcePath: string,
  index: number,
): ResolvedRule {
  if (typeof input === "string") {
    const match = normalizeRuleMatch(input, sourcePath, kind, index);
    return { kind, match, pattern: compilePattern(match) };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` contains an invalid rule at index ${index}.`);
  }

  const match = normalizeRuleMatch(input.match, sourcePath, kind, index);
  const note = normalizeRuleNote(input.note, sourcePath, kind, index);
  return { kind, match, note, pattern: compilePattern(match) };
}

function normalizeRuleMatch(
  input: unknown,
  sourcePath: string,
  kind: "block" | "confirm",
  index: number,
): string {
  if (typeof input !== "string") {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` rule ${index} must provide a string match.`);
  }

  const match = normalizeCommand(input);
  if (!match) {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` rule ${index} cannot be empty.`);
  }

  return match;
}

function normalizeRuleNote(
  input: unknown,
  sourcePath: string,
  kind: "block" | "confirm",
  index: number,
): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "string") {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` rule ${index} note must be a string.`);
  }

  const note = input.trim();
  return note || undefined;
}

function compilePattern(match: string): RegExp {
  const escaped = match
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`);
}

function pickRule(rule: ResolvedRule): Pick<ResolvedRule, "kind" | "match" | "note"> {
  return {
    kind: rule.kind,
    match: rule.match,
    note: rule.note,
  };
}

function isResolvedPolicy(policy: PolicyConfig | ResolvedPolicy): policy is ResolvedPolicy {
  return Array.isArray((policy as ResolvedPolicy).block) && typeof (policy as ResolvedPolicy).block[0]?.pattern?.test === "function"
    ? true
    : Array.isArray((policy as ResolvedPolicy).confirm) && typeof (policy as ResolvedPolicy).confirm[0]?.pattern?.test === "function";
}

function uniqueNormalized(commands: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const command of commands) {
    const value = normalizeCommand(command);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function visitNode(node: unknown, collected: string[]): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      visitNode(item, collected);
    }
    return;
  }

  if (typeof node !== "object") return;

  const commandText = commandTextFromNode(node as Record<string, unknown>);
  if (commandText) {
    collected.push(commandText);
  }

  for (const value of Object.values(node)) {
    visitNode(value, collected);
  }
}

function commandTextFromNode(node: Record<string, unknown>): string | undefined {
  if (node.type !== "Command") return undefined;

  const parts = [
    ...extractParts(node.prefix),
    ...extractParts(node.name ? [node.name] : []),
    ...extractParts(node.suffix),
  ];

  const text = normalizeCommand(parts.join(" "));
  return text || undefined;
}

function extractParts(input: unknown): string[] {
  if (!Array.isArray(input)) return input ? extractPart(input as Record<string, unknown>) : [];

  const parts: string[] = [];
  for (const item of input) {
    parts.push(...extractPart(item as Record<string, unknown>));
  }
  return parts;
}

function extractPart(input: Record<string, unknown>): string[] {
  if (!input || typeof input !== "object") return [];

  if (typeof input.text === "string") {
    return [input.text];
  }

  if (typeof input.op === "string" && input.file && typeof (input.file as { text?: unknown }).text === "string") {
    return [input.op, (input.file as { text: string }).text];
  }

  return [];
}
