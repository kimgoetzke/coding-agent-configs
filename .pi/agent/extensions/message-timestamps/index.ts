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
const AGENT_TIMESTAMP_CUSTOM_TYPE = "agent-response-timestamp";

function formatDuration(startedAt: Date, endedAt: Date): string {
  const totalSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day} ${month} ${year} · ${hours}:${minutes}:${seconds}`;
}

export default function messageTimestampsExtension(pi: ExtensionAPI) {
  let submittedAt: Date | undefined;
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

  pi.registerMessageRenderer(
    AGENT_TIMESTAMP_CUSTOM_TYPE,
    (message, _options: MessageRenderOptions, theme: Theme) => ({
      render: (width: number): string[] => {
        const timestamp = String(message.content);
        const padding = " ".repeat(Math.max(0, width - timestamp.length - 1));
        return [theme.fg("accent", ` ${timestamp}${padding}`)];
      },
      invalidate: () => {},
    }),
  );

  pi.on("agent_end", async (event, ctx) => {
    if (!ctx.hasUI) return undefined;
    // Only stamp turns that produced a real text response (not tool-only or thinking-only).
    const hasTextResponse = event.messages.some(
      (msg) =>
        msg.role === "assistant" &&
        Array.isArray((msg as any).content) &&
        (msg as any).content.some((c: any) => c.type === "text" && c.text?.trim()),
    );
    if (!hasTextResponse) return undefined;
    const receivedAt = new Date();
    const durationSuffix = submittedAt ? ` · Took ${formatDuration(submittedAt, receivedAt)}` : "";
    submittedAt = undefined;
    pi.sendMessage({
      customType: AGENT_TIMESTAMP_CUSTOM_TYPE,
      content: `Received · ${formatTimestamp(receivedAt)}${durationSuffix}`,
      display: true,
    });
  });

  pi.on("input", async (event, ctx) => {
    if (event.source !== "interactive") return { action: "continue" };
    // Skip commands and skill invocations — prepending would break their parsing.
    if (event.text.trimStart().startsWith("/") || event.text.trimStart().startsWith("!")) {
      return { action: "continue" };
    }

    submittedAt = new Date();
    const timestamp = `Sent · ${formatTimestamp(submittedAt)}`;
    const styledTimestamp = ctx.hasUI ? ctx.ui.theme.fg("accent", timestamp) : timestamp;

    return {
      action: "transform",
      text: `${event.text}\n\n${styledTimestamp}`,
    };
  });
}
