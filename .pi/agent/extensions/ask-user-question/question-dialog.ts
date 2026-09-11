import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  type Focusable,
  Key,
  matchesKey,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import {
  QuestionnaireState,
  type Answer,
  type Question,
} from "./questionnaire-state.ts";

export type DialogResult =
  | { kind: "answered"; answers: Answer[] }
  | { kind: "chat"; questionIndex: number };

export class QuestionDialog implements Focusable {
  private readonly state: QuestionnaireState;
  private readonly editor: Editor;
  private commentMode = false;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private _focused = false;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    questions: Question[],
    private readonly done: (result: DialogResult) => void,
  ) {
    this.state = new QuestionnaireState(questions);
    const editorTheme: EditorTheme = {
      borderColor: (text) => theme.fg("accent", text),
      selectList: {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      },
    };
    this.editor = new Editor(tui, editorTheme);
    this.editor.onSubmit = (value) => {
      const result = this.state.selectCurrent({ comment: value });
      this.commentMode = false;
      this.editor.setText("");
      this.finishOrRefresh(result);
    };
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value && this.commentMode;
  }

  handleInput(data: string): void {
    if (this.commentMode) {
      if (matchesKey(data, Key.escape)) {
        this.commentMode = false;
        this.editor.focused = false;
        this.editor.setText("");
        this.refresh();
        return;
      }
      this.editor.handleInput(data);
      this.refresh();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.state.move(-1);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.state.move(1);
      this.refresh();
      return;
    }
    if (/^[1-9]$/.test(data)) {
      const requestedRow = Number(data) - 1;
      const rowCount = this.state.currentQuestion.options.length + 1;
      if (requestedRow < rowCount) {
        this.state.rowIndex = requestedRow;
        this.finishOrRefresh(this.state.selectCurrent());
      }
      return;
    }
    if ((data === "c" || data === "C") && this.state.currentRow().kind === "option") {
      this.commentMode = true;
      this.editor.focused = this.focused;
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.finishOrRefresh(this.state.selectCurrent());
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.done({ kind: "chat", questionIndex: this.state.questionIndex });
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const renderWidth = Math.max(1, width);
    const question = this.state.currentQuestion;
    const lines: string[] = [this.theme.fg("accent", "─".repeat(renderWidth))];

    this.addWrapped(
      lines,
      ` ${this.theme.fg("accent", this.theme.bold(question.header))}${this.theme.fg(
        "dim",
        `  ${this.state.questionIndex + 1}/${this.state.questions.length}`,
      )}`,
      renderWidth,
    );
    this.addWrapped(lines, ` ${this.theme.fg("text", question.question)}`, renderWidth);
    if (question.explanation) {
      this.addWrapped(lines, ` ${this.theme.fg("muted", question.explanation)}`, renderWidth);
    }
    lines.push("");

    question.options.forEach((option, optionIndex) => {
      const selected = this.state.rowIndex === optionIndex;
      const prefix = selected ? this.theme.fg("accent", "> ") : "  ";
      this.addWrappedWithPrefix(
        lines,
        prefix,
        this.theme.fg(selected ? "accent" : "text", `${optionIndex + 1}. ${option.label}`),
        renderWidth,
      );
      this.addWrappedWithPrefix(
        lines,
        "     ",
        this.theme.fg("muted", option.description),
        renderWidth,
      );
    });

    const chatIndex = question.options.length;
    const chatSelected = this.state.rowIndex === chatIndex;
    this.addWrappedWithPrefix(
      lines,
      chatSelected ? this.theme.fg("warning", "> ") : "  ",
      this.theme.fg(chatSelected ? "warning" : "text", `${chatIndex + 1}. Chat about this`),
      renderWidth,
    );
    this.addWrappedWithPrefix(
      lines,
      "     ",
      this.theme.fg("muted", "Stop here and continue in normal chat."),
      renderWidth,
    );

    if (this.commentMode) {
      lines.push("");
      this.addWrapped(lines, ` ${this.theme.fg("muted", "Additional comment (optional):")}`, renderWidth);
      for (const line of this.editor.render(Math.max(1, renderWidth - 2))) {
        lines.push(` ${line}`);
      }
      this.addWrapped(lines, ` ${this.theme.fg("dim", "Enter confirm • Esc go back")}`, renderWidth);
    } else {
      lines.push("");
      this.addWrapped(
        lines,
        ` ${this.theme.fg("dim", "↑↓ navigate • Enter select • c select + comment • Esc chat")}`,
        renderWidth,
      );
    }

    lines.push(this.theme.fg("accent", "─".repeat(renderWidth)));
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.editor.invalidate();
  }

  private finishOrRefresh(result: ReturnType<QuestionnaireState["selectCurrent"]>): void {
    if (result.kind === "chat") {
      this.done({ kind: "chat", questionIndex: result.questionIndex });
      return;
    }
    if (result.kind === "complete") {
      this.done({ kind: "answered", answers: this.state.answers() });
      return;
    }
    this.refresh();
  }

  private refresh(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.tui.requestRender();
  }

  private addWrapped(lines: string[], text: string, width: number): void {
    lines.push(...wrapTextWithAnsi(text, width));
  }

  private addWrappedWithPrefix(
    lines: string[],
    prefix: string,
    text: string,
    width: number,
  ): void {
    const prefixWidth = visibleWidth(prefix);
    if (prefixWidth >= width) {
      this.addWrapped(lines, prefix + text, width);
      return;
    }
    const wrapped = wrapTextWithAnsi(text, width - prefixWidth);
    const continuation = " ".repeat(prefixWidth);
    wrapped.forEach((line, index) => {
      lines.push(`${index === 0 ? prefix : continuation}${line}`);
    });
  }
}
