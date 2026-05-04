import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

import type { CommandApprovalRequest } from "./hook";

export async function showCommandApprovalDialog(
  ctx: Pick<ExtensionContext, "ui">,
  request: CommandApprovalRequest,
): Promise<boolean> {
  return ctx.ui.custom<boolean>(
    (tui, theme, _keybindings, done) => new CommandApprovalDialog(tui, theme, request, done),
  );
}

class CommandApprovalDialog implements Component {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly request: CommandApprovalRequest,
    private readonly done: (approved: boolean) => void,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
      this.done(true);
      return;
    }

    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl("c")) ||
      data === "n" ||
      data === "N"
    ) {
      this.done(false);
      return;
    }

    this.tui.requestRender();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const innerWidth = Math.max(1, width - 2);
    const lines: string[] = [];

    lines.push(this.renderTopBorder(innerWidth));

    const bodyLines = [
      ...this.renderParagraph(
        "This command matched a policy rule and needs approval before it can run.",
        innerWidth,
      ),
      "",
      ...this.renderSection("Full command", this.request.fullCommand, innerWidth, "text"),
      "",
      ...this.renderSection("Matched rule", this.request.ruleMatch, innerWidth, "warning"),
      "",
      ...this.renderSection("Atomic command", this.request.atomicCommand, innerWidth, "text"),
      ...(this.request.note
        ? ["", ...this.renderSection("Approval hint", this.request.note, innerWidth, "warning")]
        : []),
      "",
      ...this.renderActions(innerWidth),
      "",
      ...this.renderParagraph("This approval applies only to this tool call.", innerWidth, "dim"),
    ];

    for (const line of bodyLines) {
      lines.push(this.frameLine(line, innerWidth));
    }

    lines.push(this.renderBottomBorder(innerWidth));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private renderTopBorder(innerWidth: number): string {
    const title = this.theme.fg("error", this.theme.bold("⚠ COMMAND APPROVAL REQUIRED"));
    const visible = visibleWidth(title);
    const leftWidth = Math.max(1, Math.floor((innerWidth - visible - 2) / 2));
    const rightWidth = Math.max(1, innerWidth - visible - 2 - leftWidth);

    return [
      this.theme.fg("error", "╭"),
      this.theme.fg("error", "─".repeat(leftWidth)),
      this.theme.fg("error", " "),
      title,
      this.theme.fg("error", " "),
      this.theme.fg("error", "─".repeat(rightWidth)),
      this.theme.fg("error", "╮"),
    ].join("");
  }

  private renderBottomBorder(innerWidth: number): string {
    return this.theme.fg("error", `╰${"─".repeat(innerWidth)}╯`);
  }

  private frameLine(content: string, innerWidth: number): string {
    return `${this.theme.fg("error", "│")}${this.pad(content, innerWidth)}${this.theme.fg("error", "│")}`;
  }

  private renderParagraph(text: string, width: number, color: "text" | "dim" = "text"): string[] {
    return wrapTextWithAnsi(this.theme.fg(color, text), width);
  }

  private renderSection(
    label: string,
    value: string,
    width: number,
    color: "text" | "warning",
  ): string[] {
    const contentWidth = Math.max(1, width - 2);
    const styledValue = this.theme.fg(color, value);
    const wrapped = wrapTextWithAnsi(styledValue, contentWidth);

    return [
      this.theme.fg("muted", label),
      ...wrapped.map((line) => this.theme.bg("toolPendingBg", ` ${this.pad(line, contentWidth)} `)),
    ];
  }

  private renderActions(width: number): string[] {
    const left = [
      this.theme.bold("Esc"),
      " ",
      this.theme.fg("error", "Deny"),
      this.theme.fg("dim", "  •  n deny"),
    ].join("");

    const right = [
      this.theme.bold("Enter"),
      " ",
      this.theme.fg("warning", "Approve once"),
      this.theme.fg("dim", "  •  y approve"),
    ].join("");

    const spacing = Math.max(2, width - visibleWidth(left) - visibleWidth(right));
    return [left + " ".repeat(spacing) + right];
  }

  private pad(text: string, width: number): string {
    return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
  }
}
