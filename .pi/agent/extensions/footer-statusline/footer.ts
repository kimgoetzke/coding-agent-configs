import {
  renderExtensionStatusesLine,
  renderPwdLine,
  renderSeparatorLine,
  renderStatsLine,
} from "./render.ts";
import type { FooterLinesInput } from "./types.ts";

const HOME = process.env.HOME || process.env.USERPROFILE || "";

export function buildFooterLines(input: FooterLinesInput): string[] {
  const lines: string[] = [];

  if (input.showSuggestionSeparator) {
    lines.push(renderSeparatorLine(input.width, input.theme));
  }

  lines.push(renderPwdLine(input.width, input.theme, input.cwd, input.branch, HOME));
  lines.push(renderStatsLine(input.width, input.theme, input.stats));

  const extensionStatusesLine = renderExtensionStatusesLine(input.width, input.extensionStatuses);
  if (extensionStatusesLine) {
    lines.push(extensionStatusesLine);
  }

  return lines;
}
