import {
  BRANCH_ICON,
  formatTokens,
  sanitize,
  truncatePlain,
  selectContextToken,
  buildContextDisplay,
  thinkingToken,
} from "./render.js";

const HOME = process.env.HOME || process.env.USERPROFILE || "";

function fg(theme, token, text) {
  return typeof theme?.fg === "function" ? theme.fg(token, text) : text;
}

/**
 * Build the pwd row.
 *
 * Format: <path accent>  <icon syntaxVariable><branch syntaxVariable>
 * The session name is intentionally omitted because the conversation-statusline
 * extension already shows it in the editor chrome's top border.
 */
function renderPwdLine(width, theme, cwd, branch) {
  let pwd = cwd;
  if (HOME && pwd.startsWith(HOME)) {
    pwd = `~${pwd.slice(HOME.length)}`;
  }

  if (!branch) {
    return fg(theme, "accent", truncatePlain(pwd, width));
  }

  // " <icon> <branch>" — 1 space + icon + 1 space + branch
  const suffixPlain = ` ${BRANCH_ICON} ${branch}`;
  const maxPwdWidth = Math.max(0, width - suffixPlain.length);
  const pwdTruncated = truncatePlain(pwd, maxPwdWidth);
  const branchTruncated = truncatePlain(branch, Math.max(0, width - ` ${BRANCH_ICON} `.length));

  if (pwdTruncated.length + suffixPlain.length > width) {
    // pwd is empty after truncation; still show branch
    return fg(theme, "syntaxVariable", ` ${BRANCH_ICON} ${branchTruncated}`);
  }

  return (
    fg(theme, "accent", pwdTruncated) + fg(theme, "syntaxVariable", ` ${BRANCH_ICON} ${branch}`)
  );
}

/**
 * Build the stats row.
 *
 * Left side:  ↑<in> ↓<out> R<cacheRead> W<cacheWrite> $<cost> <ctx%>/<window>
 * Right side: [(<provider>) ]<model>[ • <thinking>]
 *
 * Colour coding:
 *   ↑ input      → syntaxNumber
 *   ↓ output     → success
 *   R/W cache    → muted
 *   cost         → muted
 *   ctx%         → muted / warning / error by threshold (<40 / 40-59 / ≥60)
 *   model        → warning
 *   • separator  → muted
 *   thinking level value → thinkingOff / thinkingLow / … (level-specific token)
 */
function renderStatsLine(width, theme, ctx, pi, footerData) {
  // Accumulate cumulative token usage from ALL session entries
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const { usage } = entry.message;
      totalInput += usage.input;
      totalOutput += usage.output;
      totalCacheRead += usage.cacheRead;
      totalCacheWrite += usage.cacheWrite;
      totalCost += usage.cost.total;
    }
  }

  // Context usage
  const contextUsage = ctx.getContextUsage();
  const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const contextPercent = contextUsage?.percent ?? null;
  const contextDisplay = buildContextDisplay(contextPercent, contextWindow);
  const contextToken = selectContextToken(contextPercent);

  // Build stat segments as [plainText, colourToken] pairs
  const segments = [];
  if (totalInput > 0) segments.push([`↑${formatTokens(totalInput)}`, "syntaxNumber"]);
  if (totalOutput > 0) segments.push([`↓${formatTokens(totalOutput)}`, "success"]);
  if (totalCacheRead > 0) segments.push([`R${formatTokens(totalCacheRead)}`, "muted"]);
  if (totalCacheWrite > 0) segments.push([`W${formatTokens(totalCacheWrite)}`, "muted"]);

  const usingSubscription = ctx.model != null && ctx.modelRegistry.isUsingOAuth(ctx.model);
  if (totalCost > 0 || usingSubscription) {
    const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
    segments.push([costStr, "muted"]);
  }

  segments.push([contextDisplay, contextToken]);

  const leftPlain = segments.map(([text]) => text).join(" ");
  const leftWidth = leftPlain.length;

  // Build right side — model name + optional thinking suffix
  const modelId = ctx.model?.id ?? "no-model";
  // thinkingMuted: the " • " separator, always muted
  // thinkingValue: the level text ("thinking off", "low", "medium", …) coloured by thinkingToken
  let thinkingMuted = "";
  let thinkingValue = "";
  let thinkingColourToken = "muted";
  if (ctx.model?.reasoning) {
    const level = pi.getThinkingLevel() ?? "off";
    thinkingColourToken = thinkingToken(level);
    if (level === "off") {
      thinkingMuted = " • ";
      thinkingValue = "thinking off";
    } else {
      thinkingMuted = " • ";
      thinkingValue = level;
    }
  }
  const thinkingSuffix = thinkingMuted + thinkingValue;

  // Optionally prepend provider when multiple providers are active
  let providerPrefix = "";
  const multiProvider = footerData.getAvailableProviderCount() > 1 && ctx.model != null;
  if (multiProvider) {
    const candidate = `(${ctx.model.provider}) `;
    // Only include if it fits alongside the stats
    if (leftWidth + 2 + candidate.length + modelId.length + thinkingSuffix.length <= width) {
      providerPrefix = candidate;
    }
  }

  const rightPlain = `${providerPrefix}${modelId}${thinkingSuffix}`;
  const rightWidth = rightPlain.length;

  // Colourize left side
  const leftColoured = segments.map(([text, token]) => fg(theme, token, text)).join(" ");

  // Colourize right side: provider muted, model warning, "•" separator muted, level word coloured
  const rightColoured =
    (providerPrefix ? fg(theme, "muted", providerPrefix) : "") +
    fg(theme, "warning", modelId) +
    (thinkingMuted ? fg(theme, "muted", thinkingMuted) : "") +
    (thinkingValue ? fg(theme, thinkingColourToken, thinkingValue) : "");

  // Layout: right-align the model info
  const minPadding = 2;
  let statsLine;
  if (leftWidth + minPadding + rightWidth <= width) {
    const padding = " ".repeat(width - leftWidth - rightWidth);
    statsLine = leftColoured + padding + rightColoured;
  } else {
    const available = width - leftWidth - minPadding;
    if (available > 0) {
      const truncatedRight = truncatePlain(rightPlain, available);
      const padding = " ".repeat(width - leftWidth - truncatedRight.length);
      statsLine = leftColoured + padding + fg(theme, "accent", truncatedRight);
    } else {
      statsLine = leftColoured;
    }
  }

  return statsLine;
}

export default function footerStatuslineExtension(pi) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      // Unsubscribe function – kept for clean disposal even though we use a no-op callback
      const unsubscribeBranch = footerData.onBranchChange(() => {});

      return {
        render(width) {
          // Always read theme from ctx.ui.theme so theme switches take effect immediately
          const currentTheme = ctx.ui.theme;
          const cwd = ctx.sessionManager.getCwd();
          const branch = footerData.getGitBranch();

          const lines = [
            renderPwdLine(width, currentTheme, cwd, branch),
            renderStatsLine(width, currentTheme, ctx, pi, footerData),
          ];

          // Extension statuses (e.g. from active-mode) — one combined row
          const extensionStatuses = footerData.getExtensionStatuses();
          if (extensionStatuses.size > 0) {
            const statusLine = Array.from(extensionStatuses.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([, text]) => sanitize(text))
              .join(" ");
            lines.push(truncatePlain(statusLine, width));
          }

          return lines;
        },

        invalidate() {},

        dispose() {
          unsubscribeBranch();
        },
      };
    });
  });
}
