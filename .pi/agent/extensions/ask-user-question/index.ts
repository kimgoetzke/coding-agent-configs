import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

import { QuestionDialog, type DialogResult } from "./question-dialog.ts";
import {
  formatAnswers,
  type Answer,
  type Question,
} from "./questionnaire-state.ts";

const OptionSchema = Type.Object({
  label: Type.String({ description: "Concise option label" }),
  description: Type.String({
    description: "Explain the option's effect or trade-off",
  }),
});

const QuestionSchema = Type.Object({
  header: Type.String({
    description: "Short label, ideally no more than 12 characters",
  }),
  question: Type.String({ description: "The decision the user needs to make" }),
  explanation: Type.Optional(
    Type.String({ description: "Why this decision is needed now" }),
  ),
  options: Type.Array(OptionSchema, {
    description: "Two to four distinct answers",
    minItems: 2,
    maxItems: 4,
  }),
});

const AskUserQuestionSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "One to four related questions",
    minItems: 1,
    maxItems: 4,
  }),
});

export type AskUserQuestionInput = Static<typeof AskUserQuestionSchema>;

type AskUserQuestionDetails =
  | { outcome: "answered"; questions: Question[]; answers: Answer[] }
  | { outcome: "chat"; questions: Question[]; questionIndex: number }
  | { outcome: "unavailable"; questions: Question[] };

function unavailable(questions: Question[]) {
  return {
    content: [
      {
        type: "text" as const,
        text: "Structured question UI is unavailable outside Pi's interactive TUI. Ask the question in normal chat instead.",
      },
    ],
    details: {
      outcome: "unavailable" as const,
      questions,
    },
    terminate: true,
  };
}

export default function askUserQuestionExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask user question",
    description:
      "Ask one to four structured questions when the user's choice is needed. Each option has an explanation. The user selects by keyboard, may attach a comment, or may stop the tool to chat.",
    promptSnippet: "Ask structured questions with keyboard-selectable answers",
    promptGuidelines: [
      "Use ask_user_question when work cannot proceed without a user decision; do not use it for rhetorical questions or facts available in the repository.",
      "Keep ask_user_question option labels concise and use each option description to state its consequence or trade-off.",
    ],
    parameters: AskUserQuestionSchema,
    executionMode: "sequential",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const questions = params.questions as Question[];
      if (ctx.mode !== "tui") {
        return unavailable(questions);
      }

      const result = await ctx.ui.custom<DialogResult>((tui, theme, _keybindings, done) =>
        new QuestionDialog(tui, theme, questions, done),
      );

      if (!result || result.kind === "chat") {
        const questionIndex = result?.kind === "chat" ? result.questionIndex : 0;
        const question = questions[questionIndex];
        return {
          content: [
            {
              type: "text",
              text: `User chose to chat about: ${question.header} — ${question.question}. Stop and wait for their message.`,
            },
          ],
          details: {
            outcome: "chat",
            questions,
            questionIndex,
          } satisfies AskUserQuestionDetails,
          terminate: true,
        };
      }

      return {
        content: [{ type: "text", text: formatAnswers(questions, result.answers) }],
        details: {
          outcome: "answered",
          questions,
          answers: result.answers,
        } satisfies AskUserQuestionDetails,
      };
    },

    renderCall(args, theme) {
      const questions = (args.questions ?? []) as Question[];
      const labels = questions.map((question) => question.header).join(", ");
      return new Text(
        `${theme.fg("toolTitle", theme.bold("ask_user_question"))}${
          labels ? theme.fg("dim", ` (${labels})`) : ""
        }`,
        0,
        0,
      );
    },

    renderResult(result, _options, theme) {
      const details = result.details as AskUserQuestionDetails | undefined;
      if (!details) {
        const content = result.content[0];
        return new Text(content?.type === "text" ? content.text : "", 0, 0);
      }
      if (details.outcome === "chat") {
        return new Text(theme.fg("warning", "↩ Chat about this"), 0, 0);
      }
      if (details.outcome === "unavailable") {
        return new Text(theme.fg("error", "Structured UI unavailable"), 0, 0);
      }
      return new Text(
        details.answers
          .map((answer) => {
            const question = details.questions[answer.questionIndex];
            const comment = answer.comment
              ? theme.fg("muted", ` — ${answer.comment}`)
              : "";
            return `${theme.fg("success", "✓")} ${theme.fg("accent", question.header)}: ${answer.label}${comment}`;
          })
          .join("\n"),
        0,
        0,
      );
    },
  });
}
