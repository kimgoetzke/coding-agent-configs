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

export interface DowngradeConfig {
  confirm?: RuleInput[];
  allow?: RuleInput[];
}

export interface PolicyConfig {
  version: 1;
  block?: RuleInput[];
  confirm?: RuleInput[];
  downgrade?: DowngradeConfig;
}

export type RuleSource = "global" | "project" | "inline";

export interface ResolvedRule {
  kind: "block" | "confirm";
  source: RuleSource;
  match: string;
  note?: string;
  pattern: RegExp;
}

export interface ResolvedDowngradeRule {
  level: "confirm" | "allow";
  source: RuleSource;
  match: string;
  note?: string;
  pattern: RegExp;
}

export interface ResolvedPolicy {
  resolved: true;
  version: 1;
  block: ResolvedRule[];
  confirm: ResolvedRule[];
  downgrade: {
    confirm: ResolvedDowngradeRule[];
    allow: ResolvedDowngradeRule[];
  };
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
  const hasProject = existsSync(project);
  const hasGlobal = existsSync(global);
  const sourcePath = hasProject ? project : hasGlobal ? global : undefined;

  if (!sourcePath) {
    return { kind: "none" };
  }

  try {
    const projectPolicy = hasProject ? parsePolicyFile(project, "project") : undefined;
    const globalPolicy = hasGlobal ? parsePolicyFile(global, "global") : undefined;

    return {
      kind: "loaded",
      sourcePath,
      policy: mergePolicies(projectPolicy, globalPolicy),
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
    const projectBlock = findMatchingRule(resolved.block, atomicCommand, (rule) => rule.source !== "global");
    if (projectBlock) {
      return {
        kind: "block",
        atomicCommands,
        atomicCommand,
        rule: pickRule(projectBlock),
      };
    }

    const globalBlock = findMatchingRule(resolved.block, atomicCommand, (rule) => rule.source === "global");
    const projectConfirm = findMatchingRule(resolved.confirm, atomicCommand, (rule) => rule.source !== "global");
    const globalConfirm = findMatchingRule(resolved.confirm, atomicCommand, (rule) => rule.source === "global");
    const downgradeAllow = findMatchingDowngrade(resolved.downgrade.allow, atomicCommand);
    const downgradeConfirm = findMatchingDowngrade(resolved.downgrade.confirm, atomicCommand);

    if (globalBlock && !downgradeAllow && !downgradeConfirm) {
      return {
        kind: "block",
        atomicCommands,
        atomicCommand,
        rule: pickRule(globalBlock),
      };
    }

    if (projectConfirm) {
      return {
        kind: "confirm",
        atomicCommands,
        atomicCommand,
        rule: pickRule(projectConfirm),
      };
    }

    if (globalBlock && !downgradeAllow && downgradeConfirm) {
      return {
        kind: "confirm",
        atomicCommands,
        atomicCommand,
        rule: pickRule(globalBlock),
      };
    }

    if (globalConfirm && !downgradeAllow) {
      return {
        kind: "confirm",
        atomicCommands,
        atomicCommand,
        rule: pickRule(globalConfirm),
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

function resolvePolicy(input: unknown, sourcePath: string, source: RuleSource = "inline"): ResolvedPolicy {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} must contain an object.`);
  }

  const policy = input as Partial<PolicyConfig>;
  if (policy.version !== POLICY_VERSION) {
    throw new Error(`Policy file ${sourcePath} must set version: ${POLICY_VERSION}.`);
  }

  return {
    resolved: true,
    version: POLICY_VERSION,
    block: resolveRules(policy.block, "block", sourcePath, source),
    confirm: resolveRules(policy.confirm, "confirm", sourcePath, source),
    downgrade: resolveDowngrade(policy.downgrade, sourcePath, source),
  };
}

function resolveRules(
  input: RuleInput[] | undefined,
  kind: "block" | "confirm",
  sourcePath: string,
  source: RuleSource,
): ResolvedRule[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` must be an array.`);
  }

  return input.map((rule, index) => resolveRule(rule, kind, sourcePath, index, source));
}

function resolveRule(
  input: RuleInput,
  kind: "block" | "confirm",
  sourcePath: string,
  index: number,
  source: RuleSource,
): ResolvedRule {
  if (typeof input === "string") {
    const match = normalizeRuleMatch(input, sourcePath, kind, index);
    return { kind, source, match, pattern: compilePattern(match) };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` contains an invalid rule at index ${index}.`);
  }

  const match = normalizeRuleMatch(input.match, sourcePath, kind, index);
  const note = normalizeRuleNote(input.note, sourcePath, kind, index);
  return { kind, source, match, note, pattern: compilePattern(match) };
}

function normalizeRuleMatch(
  input: unknown,
  sourcePath: string,
  kind: "block" | "confirm" | "downgrade.confirm" | "downgrade.allow",
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
  kind: "block" | "confirm" | "downgrade.confirm" | "downgrade.allow",
  index: number,
): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "string") {
    throw new Error(`Policy file ${sourcePath} field \`${kind}\` rule ${index} note must be a string.`);
  }

  const note = input.trim();
  return note || undefined;
}

function resolveDowngrade(
  input: DowngradeConfig | undefined,
  sourcePath: string,
  source: RuleSource,
): ResolvedPolicy["downgrade"] {
  if (input === undefined) {
    return { confirm: [], allow: [] };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} field \`downgrade\` must be an object.`);
  }

  return {
    confirm: resolveDowngradeRules(input.confirm, "confirm", sourcePath, source),
    allow: resolveDowngradeRules(input.allow, "allow", sourcePath, source),
  };
}

function resolveDowngradeRules(
  input: RuleInput[] | undefined,
  level: "confirm" | "allow",
  sourcePath: string,
  source: RuleSource,
): ResolvedDowngradeRule[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} field \`downgrade.${level}\` must be an array.`);
  }

  return input.map((rule, index) => resolveDowngradeRule(rule, level, sourcePath, index, source));
}

function resolveDowngradeRule(
  input: RuleInput,
  level: "confirm" | "allow",
  sourcePath: string,
  index: number,
  source: RuleSource,
): ResolvedDowngradeRule {
  if (typeof input === "string") {
    const match = normalizeRuleMatch(input, sourcePath, `downgrade.${level}`, index);
    return { level, source, match, pattern: compilePattern(match) };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Policy file ${sourcePath} field \`downgrade.${level}\` contains an invalid rule at index ${index}.`);
  }

  const match = normalizeRuleMatch(input.match, sourcePath, `downgrade.${level}`, index);
  const note = normalizeRuleNote(input.note, sourcePath, `downgrade.${level}`, index);
  return { level, source, match, note, pattern: compilePattern(match) };
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
  return (policy as ResolvedPolicy).resolved === true;
}

function parsePolicyFile(sourcePath: string, source: RuleSource): ResolvedPolicy {
  const raw = readFileSync(sourcePath, "utf8");
  const parsed = JSON5.parse(raw) as unknown;
  return resolvePolicy(parsed, sourcePath, source);
}

function mergePolicies(projectPolicy?: ResolvedPolicy, globalPolicy?: ResolvedPolicy): ResolvedPolicy {
  return {
    resolved: true,
    version: POLICY_VERSION,
    block: [...(projectPolicy?.block ?? []), ...(globalPolicy?.block ?? [])],
    confirm: [...(projectPolicy?.confirm ?? []), ...(globalPolicy?.confirm ?? [])],
    downgrade: {
      confirm: [...(projectPolicy?.downgrade.confirm ?? [])],
      allow: [...(projectPolicy?.downgrade.allow ?? [])],
    },
  };
}

function findMatchingRule(
  rules: ResolvedRule[],
  atomicCommand: string,
  predicate: (rule: ResolvedRule) => boolean,
): ResolvedRule | undefined {
  return rules.find((rule) => predicate(rule) && rule.pattern.test(atomicCommand));
}

function findMatchingDowngrade(
  rules: ResolvedDowngradeRule[],
  atomicCommand: string,
): ResolvedDowngradeRule | undefined {
  return rules.find((rule) => rule.pattern.test(atomicCommand));
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
