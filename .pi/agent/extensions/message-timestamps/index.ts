import type { ExtensionAPI, MessageRenderOptions, Theme } from "@mariozechner/pi-coding-agent";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
// Kept for backwards compatibility: renders timestamp messages from previous sessions.
const TIMESTAMP_CUSTOM_TYPE = "submit-timestamp";

function formatTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `── ${day} ${month} ${year} · ${hours}:${minutes}:${seconds} ──`;
}

export default function messageTimestampsExtension(pi: ExtensionAPI) {
  // Renderer for custom timestamp messages written by previous sessions.
  pi.registerMessageRenderer(
    TIMESTAMP_CUSTOM_TYPE,
    (message, _options: MessageRenderOptions, theme: Theme) => ({
      render: (width: number): string[] => {
        const timestamp = String(message.content);
        const padding = " ".repeat(Math.max(0, width - timestamp.length - 1));
        return [theme.bg("userMessageBg", theme.fg("accent", ` ${timestamp}${padding}`))];
      },
      invalidate: () => {},
    }),
  );

  pi.on("input", async (event, ctx) => {
    if (event.source !== "interactive") return { action: "continue" };
    // Skip commands and skill invocations — prepending would break their parsing.
    if (event.text.trimStart().startsWith("/") || event.text.trimStart().startsWith("!")) {
      return { action: "continue" };
    }

    const timestamp = formatTimestamp(new Date());
    const styledTimestamp = ctx.hasUI ? ctx.ui.theme.fg("accent", timestamp) : timestamp;

    return {
      action: "transform",
      text: `${styledTimestamp}\n\n${event.text}`,
    };
  });
}
