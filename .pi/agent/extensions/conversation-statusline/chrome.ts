import { fitSessionLabel } from "./layout.ts";

const DASH = "─";
const TRAILING_DASH_COUNT = 5;
const MIN_LEFT_GUTTER = 8;
const MIN_LABEL_WIDTH = 4;
const RESET_ANSI = "[0m";
// Theme tokens corresponding to blue, teal, green, purple, yellow and orange.
const NAME_COLOURS = ["accent", "syntaxNumber", "success", "mdLink", "syntaxVariable", "syntaxKeyword"] as const;

export type FullThemeLike = {
  fg?: (token: string, text: string) => string;
  bg?: (token: string, text: string) => string;
  getFgAnsi?: (token: string) => string;
  getBgAnsi?: (token: string) => string;
};

function plainLine(width: number): string {
  return DASH.repeat(Math.max(0, width));
}

function colorizeLine(
  theme: FullThemeLike,
  text: string,
  colourToken: string | undefined,
  fallbackRenderer?: (text: string) => string,
): string {
  if (colourToken && typeof theme.fg === "function") {
    return theme.fg(colourToken, text);
  }

  if (typeof fallbackRenderer === "function") {
    return fallbackRenderer(text);
  }

  return text;
}

function nameColour(sessionName: string): string {
  let hash = 2166136261;
  for (const char of sessionName.trim()) {
    hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  }
  return NAME_COLOURS[(hash >>> 0) % NAME_COLOURS.length];
}

function rgbFromAnsi(ansi: string | undefined): number[] | undefined {
  const match = ansi?.match(/\[38;2;(\d+);(\d+);(\d+)m/);
  return match ? match.slice(1).map(Number) : undefined;
}

function contrast(fg: number[], bg: number[]): number {
  const luminance = (rgb: number[]) => {
    const channels = rgb.map((value) => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function renderLabel(theme: FullThemeLike, label: string, colourToken: string): string {
  const lineFgAnsi = theme.getFgAnsi?.(colourToken);
  const lightTextAnsi = theme.getFgAnsi?.("userMessageText");
  if (lineFgAnsi?.includes("[38;") && lightTextAnsi?.includes("[38;")) {
    const selectedBgAnsi = theme.getBgAnsi?.("selectedBg");
    const background = rgbFromAnsi(lineFgAnsi);
    const light = rgbFromAnsi(lightTextAnsi);
    const darkTextAnsi = selectedBgAnsi?.replace("[48;", "[38;");
    const dark = rgbFromAnsi(darkTextAnsi);
    const textAnsi = background && light && dark && contrast(dark, background) > contrast(light, background)
      ? darkTextAnsi
      : lightTextAnsi;
    return `${lineFgAnsi.replace("[38;", "[48;")}${textAnsi}${label}${RESET_ANSI}`;
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
  options: { sessionName?: string; fallbackRenderer?: (text: string) => string } = {},
): string {
  const { sessionName, fallbackRenderer } = options;
  return colorizeLine(theme, plainLine(width), sessionName?.trim() ? nameColour(sessionName) : undefined, fallbackRenderer);
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

  const colourToken = nameColour(normalizedName);
  const label = fitTopLineLabel(normalizedName, width);
  if (!label) {
    return renderLine(theme, width, { sessionName: normalizedName, fallbackRenderer });
  }

  const trailingWidth = Math.min(TRAILING_DASH_COUNT, Math.max(0, width - label.length));
  const leadingWidth = Math.max(0, width - label.length - trailingWidth);

  return `${renderLine(theme, leadingWidth, { sessionName: normalizedName, fallbackRenderer })}${renderLabel(theme, label, colourToken)}${renderLine(theme, trailingWidth, { sessionName: normalizedName, fallbackRenderer })}`;
}
