import { classifyCommand, loadPolicyForCwd, type PolicyLoadResult } from "./policy";

export interface CommandPolicyContext {
  cwd: string;
  hasUI: boolean;
}

export interface CommandApprovalRequest {
  fullCommand: string;
  ruleMatch: string;
  atomicCommand: string;
  note?: string;
}

export interface CommandPolicyDeps {
  loadPolicy?: (cwd: string) => PolicyLoadResult;
  confirm?: (request: CommandApprovalRequest) => Promise<boolean>;
  notify?: (message: string, level: "info" | "warning" | "error") => void;
}

export async function handleBashCommandPolicy(
  command: string,
  ctx: CommandPolicyContext,
  deps: CommandPolicyDeps = {},
): Promise<{ block: true; reason: string } | undefined> {
  const loadPolicy = deps.loadPolicy ?? loadPolicyForCwd;
  const loaded = loadPolicy(ctx.cwd);

  if (loaded.kind === "none") {
    return undefined;
  }

  if (loaded.kind === "error") {
    const reason = `Command policy configuration error at "${loaded.sourcePath}": ${loaded.error}. Fix the policy file before retrying.`;
    deps.notify?.(reason, "error");
    return { block: true, reason };
  }

  const decision = classifyCommand(command, loaded.policy);
  if (decision.kind === "allow") {
    return undefined;
  }

  if (decision.kind === "block") {
    const reason = formatBlockReason(decision.rule.match, decision.atomicCommand, decision.rule.note);
    deps.notify?.(reason, "warning");
    return { block: true, reason };
  }

  if (!ctx.hasUI || !deps.confirm) {
    const reason = formatConfirmUnavailableReason(decision.rule.match, decision.atomicCommand, decision.rule.note);
    deps.notify?.(reason, "warning");
    return { block: true, reason };
  }

  const approved = await deps.confirm({
    fullCommand: command,
    ruleMatch: decision.rule.match,
    atomicCommand: decision.atomicCommand,
    note: decision.rule.note,
  });
  if (approved) {
    return undefined;
  }

  const reason = formatConfirmDeniedReason(decision.rule.match, decision.atomicCommand, decision.rule.note);
  deps.notify?.(reason, "warning");
  return { block: true, reason };
}

export function formatBlockReason(ruleMatch: string, atomicCommand: string, note?: string): string {
  return [
    `Blocked by command policy: matched block rule "${ruleMatch}" for atomic command "${atomicCommand}".`,
    "Retrying the same command unchanged will fail again.",
    "Use a different approach.",
    note ? `Guidance: ${note}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatConfirmPrompt(
  fullCommand: string,
  ruleMatch: string,
  atomicCommand: string,
  note?: string,
): string {
  return [
    `Full bash command: ${fullCommand}`,
    `Matched confirm rule: ${ruleMatch}`,
    `Matched atomic command: ${atomicCommand}`,
    note ? `Approval hint: ${note}` : undefined,
    "Allow this command to run?",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function formatConfirmUnavailableReason(ruleMatch: string, atomicCommand: string, note?: string): string {
  return [
    `Command requires approval by command policy: matched confirm rule "${ruleMatch}" for atomic command "${atomicCommand}", but approval UI is unavailable in this mode.`,
    "Do not retry the same command unchanged.",
    note ? `Approval hint: ${note}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatConfirmDeniedReason(ruleMatch: string, atomicCommand: string, note?: string): string {
  return [
    `Command requires approval by command policy: matched confirm rule "${ruleMatch}" for atomic command "${atomicCommand}", and the approval request was declined.`,
    "Do not retry the same command unchanged unless the user explicitly approves it.",
    note ? `Approval hint: ${note}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}
