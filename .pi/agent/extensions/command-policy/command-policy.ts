import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { showCommandApprovalDialog } from "./approval-dialog";
import { formatConfirmPrompt, handleBashCommandPolicy, type CommandApprovalRequest } from "./hook";

export default function (pi: ExtensionAPI) {
  async function confirmWithCustomLayout(ctx: Pick<ExtensionContext, "ui">, request: CommandApprovalRequest): Promise<boolean> {
    try {
      return await showCommandApprovalDialog(ctx, request);
    } catch {
      return ctx.ui.confirm(
        "Command policy approval required",
        formatConfirmPrompt(request.fullCommand, request.ruleMatch, request.atomicCommand, request.note),
      );
    }
  }

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) {
      return undefined;
    }

    return handleBashCommandPolicy(
      event.input.command,
      {
        cwd: ctx.cwd,
        hasUI: ctx.hasUI,
      },
      {
        confirm: ctx.hasUI ? (request) => confirmWithCustomLayout(ctx, request) : undefined,
        notify: ctx.hasUI
          ? (message, level) => {
              ctx.ui.notify(message, level);
            }
          : undefined,
      },
    );
  });
}
