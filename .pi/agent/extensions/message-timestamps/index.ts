import type { ExtensionAPI, MessageRenderOptions, Theme } from "@earendil-works/pi-coding-agent";

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

  // sendMessage() always creates a CustomMessageEntry that goes to LLM context.
  // Any delivery mode that lets the current agent lifecycle consume it ("steer" or
  // "followUp") triggers another LLM turn → infinite loop.
  // "nextTurn" avoids the loop but is only delivered after the next user prompt.
  //
  // Since 0.75.4 the agent lifecycle is fully awaited before agent_end fires, so
  // sendMessage from agent_end is always queued until the next user prompt regardless
  // of delivery mode.  The only immediate, non-LLM display mechanism available is
  // ctx.ui.setWidget, which renders a line above the editor right away.
  // The registered renderer below stays for backward-compat with old stored timestamps.
  pi.on("agent_end", async (event, ctx) => {
    if (!ctx.hasUI) return undefined;
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
    const content = `Received · ${formatTimestamp(receivedAt)}${durationSuffix}`;
    ctx.ui.setWidget("received-timestamp", [ctx.ui.theme.fg("accent", ` ${content}`)]);
  });

  pi.on("input", async (event, ctx) => {
    if (event.source !== "interactive") return { action: "continue" };
    // Skip skill invocations and shell commands — the timestamp would leak into skill args
    // or be executed as a shell command. Extension commands (/cmd) are handled before the
    // input event fires, so they are unaffected.
    if (event.text.trimStart().startsWith("/") || event.text.trimStart().startsWith("!")) {
      return { action: "continue" };
    }

    submittedAt = new Date();
    // Clear the received-timestamp widget now that the user is responding.
    ctx.ui.setWidget("received-timestamp", []);
    const timestamp = `Sent · ${formatTimestamp(submittedAt)}`;
    const styledTimestamp = ctx.hasUI ? ctx.ui.theme.fg("accent", timestamp) : timestamp;

    return {
      action: "transform",
      text: `${event.text}\n\n${styledTimestamp}`,
    };
  });
}
