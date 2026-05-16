import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type ThemeLike = {
  fg?: (token: string, text: string) => string;
  bold?: (text: string) => string;
};

export type LoadedCounts = {
  contextFiles: number;
  skills: number;
  extensions: number;
  promptTemplates: number;
};

// Pi logo rendered as 4×4 block grid (each cell = 2 chars wide, 1 char tall).
// Derived from the official SVG (homarr-labs/dashboard-icons):
//   row 0: top bar across all 3 P-columns
//   row 1: left stem + right arm with hole in middle
//   row 2: 2-unit-wide stem + detached "i" block
//   row 3: 1-unit stem + "i" block
const LOGO_LINES = [
  "██████  ", // row 0: cols 0,1,2 filled (top bar); col 3 empty
  "██  ██  ", // row 1: cols 0,2 filled; col 1 = hole; col 3 empty
  "████  ██", // row 2: cols 0,1 filled; col 2 empty; col 3 = i
  "██    ██", // row 3: col 0 filled; cols 1,2 empty; col 3 = i
] as const;

const LOGO_PLAIN_WIDTH = 8;
const LOGO_GAP_WIDTH = 2;
const LEFT_TEXT_WIDTH = 20;

// Inner width of the left column (chars between the outer │ and the divider │):
// 1 (leading space) + 8 (logo) + 2 (gap) + 20 (text) + 1 (trailing space) = 32
const LEFT_COL_INNER_WIDTH = 1 + LOGO_PLAIN_WIDTH + LOGO_GAP_WIDTH + LEFT_TEXT_WIDTH + 1;

// 4 logo rows + 1 blank spacing row (aligns with 5 right-column rows)
const CONTENT_ROW_COUNT = 5;
const EMPTY_LOGO_ROW = " ".repeat(LOGO_PLAIN_WIDTH);
const TICK = "✓";
const WIDGET_KEY = "welcome-hero";

function fg(theme: ThemeLike, token: string, text: string): string {
  if (typeof theme.fg === "function") {
    return theme.fg(token, text);
  }
  return text;
}

function bold(theme: ThemeLike, text: string): string {
  if (typeof theme.bold === "function") {
    return theme.bold(text);
  }
  return text;
}

export function renderHero(
  width: number,
  model: string,
  provider: string,
  counts: LoadedCounts,
  theme: ThemeLike,
): string[] {
  // Right col inner = width minus: 2 outer borders + left col + 1 divider
  const rightColInner = width - 2 - LEFT_COL_INNER_WIDTH - 1;
  if (rightColInner < 10) {
    return [];
  }
  // Usable text width inside right col (leading + trailing spaces each take 1 char)
  const rightTextWidth = rightColInner - 2;

  const border = (text: string) => fg(theme, "borderAccent", text);

  const leftTextPlain = ["Welcome!", model, provider, "", ""];
  const leftTextColoured = [
    fg(theme, "mdCode", bold(theme, "Welcome!")),
    fg(theme, "warning", model),
    fg(theme, "dim", provider),
    "",
    "",
  ];

  // Right column: "Loaded" heading + one count per row, each prefixed with ✓
  const tick = fg(theme, "success", TICK);
  const countRow = (count: number, label: string) => ({
    plain: `${TICK} ${count} ${label}`,
    coloured: `${tick}${fg(theme, "text", ` ${count} ${label}`)}`,
  });

  const rightRows = [
    { plain: "Loaded", coloured: fg(theme, "mdCode", bold(theme, "Loaded")) },
    countRow(counts.contextFiles, "context files"),
    countRow(counts.skills, "skills"),
    countRow(counts.extensions, "extensions"),
    countRow(counts.promptTemplates, "prompts"),
  ];

  const leftDashes = "─".repeat(LEFT_COL_INNER_WIDTH);
  const rightDashes = "─".repeat(rightColInner);
  const blankRow = `${border("│")}${" ".repeat(LEFT_COL_INNER_WIDTH)}${border("│")}${" ".repeat(rightColInner)}${border("│")}`;
  const lines: string[] = [];

  // Top border with column junction
  lines.push(border(`╭${leftDashes}┬${rightDashes}╮`));

  // Spacing row inside top border
  lines.push(blankRow);

  for (let i = 0; i < CONTENT_ROW_COUNT; i++) {
    const logoColoured =
      i < LOGO_LINES.length ? fg(theme, "accent", LOGO_LINES[i]) : EMPTY_LOGO_ROW;

    const textPad = " ".repeat(Math.max(0, LEFT_TEXT_WIDTH - (leftTextPlain[i]?.length ?? 0)));
    const leftContent = ` ${logoColoured}  ${leftTextColoured[i]}${textPad} `;

    const rightPad = " ".repeat(Math.max(0, rightTextWidth - (rightRows[i]?.plain.length ?? 0)));
    const rightContent = ` ${rightRows[i]?.coloured ?? ""}${rightPad} `;

    lines.push(`${border("│")}${leftContent}${border("│")}${rightContent}${border("│")}`);
  }

  // Spacing row inside bottom border
  lines.push(blankRow);

  // Bottom border with column junction
  lines.push(border(`╰${leftDashes}┴${rightDashes}╯`));

  return lines;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function countExistingFiles(paths: string[]): Promise<number> {
  const results = await Promise.all(paths.map(fileExists));
  return results.filter(Boolean).length;
}

export async function countExtensionsInDir(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(
      (entry) =>
        entry.isDirectory() ||
        (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))),
    ).length;
  } catch {
    return 0;
  }
}

export async function countMarkdownFiles(dirs: string[]): Promise<number> {
  let total = 0;
  for (const dir of dirs) {
    try {
      const entries = await readdir(dir, { recursive: true, withFileTypes: true });
      total += entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
    } catch {
      // Directory does not exist or is not readable — skip
    }
  }
  return total;
}

export async function discoverLoadedCounts(cwd: string, skillCount: number): Promise<LoadedCounts> {
  const home = homedir();
  const contextFilePaths = [
    join(home, ".pi", "agent", "AGENTS.md"),
    join(home, ".claude", "AGENTS.md"),
    join(cwd, "AGENTS.md"),
    join(cwd, ".pi", "AGENTS.md"),
    join(cwd, ".claude", "AGENTS.md"),
  ];

  const commandDirs = [
    join(home, ".pi", "agent", "commands"),
    join(home, ".claude", "commands"),
    join(cwd, ".pi", "commands"),
    join(cwd, ".claude", "commands"),
  ];

  const [contextFiles, globalExtensions, projectExtensions, promptTemplates] = await Promise.all([
    countExistingFiles(contextFilePaths),
    countExtensionsInDir(join(home, ".pi", "agent", "extensions")),
    countExtensionsInDir(join(cwd, ".pi", "extensions")),
    countMarkdownFiles(commandDirs),
  ]);

  return {
    contextFiles,
    skills: skillCount,
    extensions: globalExtensions + projectExtensions,
    promptTemplates,
  };
}

export default function welcomeHeroExtension(pi: ExtensionAPI) {
  let dismissed = false;

  pi.on("session_start", async (event: any, ctx: any) => {
    if (event.reason !== "startup" || !ctx.hasUI) {
      return undefined;
    }

    dismissed = false;

    const skillCount = pi.getCommands().filter((c: any) => c.source === "skill").length;
    const counts = await discoverLoadedCounts(ctx.cwd, skillCount);
    const model: string = ctx.model?.id ?? "unknown";
    const provider: string = ctx.model?.provider ?? "";

    ctx.ui.setWidget(
      WIDGET_KEY,
      (_tui: any, theme: any) => ({
        render(width: number): string[] {
          return renderHero(width, model, provider, counts, theme);
        },
        invalidate() {},
      }),
      { placement: "aboveEditor" },
    );

    return undefined;
  });

  pi.on("before_agent_start", (_event: any, ctx: any) => {
    if (!ctx.hasUI || dismissed) {
      return undefined;
    }
    dismissed = true;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return undefined;
  });
}
