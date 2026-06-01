import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type FullThemeLike, renderLine, renderTopLine } from "./chrome.ts";

class ConversationStatuslineEditor extends CustomEditor {
  private readonly getChromeTheme: () => FullThemeLike;
  private readonly getSessionName: () => string | undefined;

  constructor(
    tui: ConstructorParameters<typeof CustomEditor>[0],
    editorTheme: ConstructorParameters<typeof CustomEditor>[1],
    keybindings: ConstructorParameters<typeof CustomEditor>[2],
    getChromeTheme: () => FullThemeLike,
    getSessionName: () => string | undefined,
  ) {
    super(tui, editorTheme, keybindings);
    this.getChromeTheme = getChromeTheme;
    this.getSessionName = getSessionName;
  }

  render(width: number): string[] {
    const sessionName = this.getSessionName();
    const chromeTheme = this.getChromeTheme();
    const originalBorderColor = this.borderColor;

    if (sessionName?.trim()) {
      this.borderColor = (text: string) => renderLine(chromeTheme, text.length, { accent: true, fallbackRenderer: originalBorderColor });
    }

    try {
      const lines = super.render(width);
      if (lines.length === 0 || !sessionName?.trim()) {
        return lines;
      }

      lines[0] = renderTopLine(chromeTheme, width, sessionName, originalBorderColor);
      return lines;
    } finally {
      this.borderColor = originalBorderColor;
    }
  }
}

export default function conversationStatuslineExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }

    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new ConversationStatuslineEditor(tui, theme, keybindings, () => ctx.ui.theme, () => pi.getSessionName()),
    );
  });
}
