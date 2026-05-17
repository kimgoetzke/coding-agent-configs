import { fitSessionLabel } from "./layout.ts";

const DASH = "─";
const TRAILING_DASH_COUNT = 5;
const MIN_LEFT_GUTTER = 8;
const MIN_LABEL_WIDTH = 4;
const RESET_ANSI = "[0m";

export type FullThemeLike = {
  fg?: (token: string, text: string) => string;
  bg?: (token: string, text: string) => string;
  getFgAnsi?: (token: string) => string;
};

function plainLine(width: number): string {
  return DASH.repeat(Math.max(0, width));
}

function colorizeLine(
  theme: FullThemeLike,
  text: string,
  accent: boolean,
  fallbackRenderer?: (text: string) => string,
): string {
  if (accent && theme && typeof theme.fg === "function") {
    return theme.fg("accent", text);
  }

  if (typeof fallbackRenderer === "function") {
    return fallbackRenderer(text);
  }

  return text;
}

function fgAnsiToBgAnsi(fgAnsi: string): string {
  return fgAnsi.replace("[38;", "[48;");
}

function renderLabel(theme: FullThemeLike, label: string): string {
  const accentFgAnsi = theme?.getFgAnsi?.("accent");
  const textFgAnsi = theme?.getFgAnsi?.("userMessageText");
  if (accentFgAnsi && textFgAnsi) {
    return `${fgAnsiToBgAnsi(accentFgAnsi)}${textFgAnsi}${label}${RESET_ANSI}`;
  }

  if (theme && typeof theme.bg === "function" && typeof theme.fg === "function") {
    return theme.bg("selectedBg", theme.fg("userMessageText", label));
  }

  return label;
}

function fitTopLineLabel(sessionName: string | undefined, width: number): string {
  const minimumReservedWidth = MIN_LEFT_GUTTER + TRAILING_DASH_COUNT + MIN_LABEL_WIDTH;
  const labelWidth =
    width > minimumReservedWidth ? width - MIN_LEFT_GUTTER - TRAILING_DASH_COUNT : width - TRAILING_DASH_COUNT;
  return fitSessionLabel(sessionName, Math.max(0, labelWidth));
}

export function renderLine(
  theme: FullThemeLike,
  width: number,
  options: { accent?: boolean; fallbackRenderer?: (text: string) => string } = {},
): string {
  const { accent = false, fallbackRenderer } = options;
  return colorizeLine(theme, plainLine(width), accent, fallbackRenderer);
}

export function renderTopLine(
  theme: FullThemeLike,
  width: number,
  sessionName: string | undefined,
  fallbackRenderer?: (text: string) => string,
): string {
  const normalizedName = sessionName?.trim();
  if (!normalizedName) {
    return renderLine(theme, width, { fallbackRenderer });
  }

  const label = fitTopLineLabel(normalizedName, width);
  if (!label) {
    return renderLine(theme, width, { accent: true, fallbackRenderer });
  }

  const trailingWidth = Math.min(TRAILING_DASH_COUNT, Math.max(0, width - label.length));
  const leadingWidth = Math.max(0, width - label.length - trailingWidth);

  return `${renderLine(theme, leadingWidth, { accent: true, fallbackRenderer })}${renderLabel(theme, label)}${renderLine(theme, trailingWidth, { accent: true, fallbackRenderer })}`;
}
