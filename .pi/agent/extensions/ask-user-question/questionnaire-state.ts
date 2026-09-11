export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  header: string;
  question: string;
  explanation?: string;
  options: QuestionOption[];
}

export interface Answer {
  questionIndex: number;
  optionIndex: number;
  label: string;
  comment?: string;
}

export type SelectionResult =
  | { kind: "next" }
  | { kind: "complete" }
  | { kind: "chat"; questionIndex: number };

export type CurrentRow =
  | { kind: "option"; optionIndex: number }
  | { kind: "chat" };

export function formatAnswers(questions: Question[], answers: Answer[]): string {
  const lines = ["User answered:"];
  for (const answer of answers) {
    const question = questions[answer.questionIndex];
    lines.push(`- ${question.header} — ${question.question}: ${answer.label}`);
    if (answer.comment) {
      lines.push(`  Additional comment: ${answer.comment}`);
    }
  }
  return lines.join("\n");
}

export class QuestionnaireState {
  readonly questions: Question[];
  questionIndex = 0;
  rowIndex = 0;
  isFinished = false;

  private readonly selectedAnswers = new Map<number, Answer>();

  constructor(questions: Question[]) {
    if (questions.length === 0) {
      throw new Error("At least one question is required");
    }
    this.questions = questions;
  }

  get currentQuestion(): Question {
    return this.questions[this.questionIndex];
  }

  currentRow(): CurrentRow {
    if (this.rowIndex === this.currentQuestion.options.length) {
      return { kind: "chat" };
    }
    return { kind: "option", optionIndex: this.rowIndex };
  }

  move(offset: number): void {
    const rowCount = this.currentQuestion.options.length + 1;
    this.rowIndex = (this.rowIndex + offset + rowCount) % rowCount;
  }

  selectCurrent(options: { comment?: string } = {}): SelectionResult {
    const row = this.currentRow();
    if (row.kind === "chat") {
      this.isFinished = true;
      return { kind: "chat", questionIndex: this.questionIndex };
    }

    const answer: Answer = {
      questionIndex: this.questionIndex,
      optionIndex: row.optionIndex,
      label: this.currentQuestion.options[row.optionIndex].label,
    };
    const comment = options.comment?.trim();
    if (comment) {
      answer.comment = comment;
    }
    this.selectedAnswers.set(this.questionIndex, answer);

    if (this.questionIndex === this.questions.length - 1) {
      this.isFinished = true;
      return { kind: "complete" };
    }

    this.questionIndex += 1;
    this.rowIndex = 0;
    return { kind: "next" };
  }

  answers(): Answer[] {
    return [...this.selectedAnswers.values()].sort(
      (left, right) => left.questionIndex - right.questionIndex,
    );
  }
}
