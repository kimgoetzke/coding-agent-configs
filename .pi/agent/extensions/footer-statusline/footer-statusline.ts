import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { buildFooterLines } from "./footer.ts";
import type { FooterStats, FooterUsageTotals } from "./types.ts";

type FooterDataLike = {
  getGitBranch(): string | null;
  getExtensionStatuses(): ReadonlyMap<string, string>;
  getAvailableProviderCount(): number;
  onBranchChange(callback: () => void): () => void;
};

type AutocompleteAwareEditor = {
  isShowingAutocomplete?: () => boolean;
};

function collectUsageTotals(ctx: ExtensionContext): FooterUsageTotals {
  const totals: FooterUsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const { usage } = entry.message;
      totals.input += usage.input;
      totals.output += usage.output;
      totals.cacheRead += usage.cacheRead;
      totals.cacheWrite += usage.cacheWrite;
      totals.cost += usage.cost.total;
    }
  }

  return totals;
}

function buildStats(ctx: ExtensionContext, pi: ExtensionAPI, footerData: FooterDataLike): FooterStats {
  const contextUsage = ctx.getContextUsage();

  return {
    totals: collectUsageTotals(ctx),
    contextWindow: contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0,
    contextPercent: contextUsage?.percent ?? null,
    modelId: ctx.model?.id ?? "no-model",
    provider: ctx.model?.provider,
    multiProvider: footerData.getAvailableProviderCount() > 1 && ctx.model != null,
    usingSubscription: ctx.model != null && ctx.modelRegistry.isUsingOAuth(ctx.model),
    reasoning: ctx.model?.reasoning ?? false,
    thinkingLevel: ctx.model?.reasoning ? pi.getThinkingLevel() ?? "off" : undefined,
  };
}

export default function footerStatuslineExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }

    let currentEditor: AutocompleteAwareEditor | undefined;
    const editorTrackingTimer = setTimeout(() => {
      const baseFactory = ctx.ui.getEditorComponent();
      ctx.ui.setEditorComponent((tui, theme, keybindings) => {
        const editor = baseFactory?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
        currentEditor = editor as AutocompleteAwareEditor;
        return editor;
      });
    }, 0);

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribeBranch = footerData.onBranchChange(() => {});

      return {
        render(width: number) {
          return buildFooterLines({
            width,
            theme: ctx.ui.theme,
            cwd: ctx.sessionManager.getCwd(),
            branch: footerData.getGitBranch(),
            extensionStatuses: footerData.getExtensionStatuses(),
            showSuggestionSeparator: currentEditor?.isShowingAutocomplete?.() ?? false,
            stats: buildStats(ctx, pi, footerData),
          });
        },

        invalidate() {},

        dispose() {
          clearTimeout(editorTrackingTimer);
          unsubscribeBranch();
        },
      };
    });
  });
}
