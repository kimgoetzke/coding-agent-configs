import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAnswers,
  QuestionnaireState,
  type Question,
} from "./questionnaire-state.ts";

const questions: Question[] = [
  {
    header: "Scope",
    question: "Which scope should we use?",
    options: [
      { label: "Small", description: "Only the reported path" },
      { label: "Broad", description: "Related paths too" },
    ],
  },
  {
    header: "Delivery",
    question: "How should this ship?",
    options: [
      { label: "One change", description: "Ship together" },
      { label: "In stages", description: "Ship incrementally" },
    ],
  },
];

test("selecting answers advances through questions and completes", () => {
  const state = new QuestionnaireState(questions);

  assert.deepEqual(state.selectCurrent(), { kind: "next" });
  assert.equal(state.questionIndex, 1);

  state.move(1);
  assert.deepEqual(state.selectCurrent(), { kind: "complete" });
  assert.deepEqual(state.answers(), [
    { questionIndex: 0, optionIndex: 0, label: "Small" },
    { questionIndex: 1, optionIndex: 1, label: "In stages" },
  ]);
});

test("Chat about this is always the final row and stops the questionnaire", () => {
  const state = new QuestionnaireState(questions);

  state.move(questions[0].options.length);

  assert.equal(state.currentRow().kind, "chat");
  assert.deepEqual(state.selectCurrent(), { kind: "chat", questionIndex: 0 });
  assert.equal(state.isFinished, true);
});

test("a comment is attached to the selected answer", () => {
  const state = new QuestionnaireState([questions[0]]);

  assert.deepEqual(state.selectCurrent({ comment: "Keep the public API unchanged." }), {
    kind: "complete",
  });
  assert.deepEqual(state.answers(), [
    {
      questionIndex: 0,
      optionIndex: 0,
      label: "Small",
      comment: "Keep the public API unchanged.",
    },
  ]);
});

test("moving wraps across all options including Chat about this", () => {
  const state = new QuestionnaireState([questions[0]]);

  state.move(-1);
  assert.equal(state.currentRow().kind, "chat");
  state.move(1);
  assert.deepEqual(state.currentRow(), { kind: "option", optionIndex: 0 });
});

test("formatted answers include question, selection, and optional comment", () => {
  const state = new QuestionnaireState(questions);
  state.selectCurrent({ comment: "Do not change adjacent APIs." });
  state.move(1);
  state.selectCurrent();

  assert.equal(
    formatAnswers(questions, state.answers()),
    [
      "User answered:",
      "- Scope — Which scope should we use?: Small",
      "  Additional comment: Do not change adjacent APIs.",
      "- Delivery — How should this ship?: In stages",
    ].join("\n"),
  );
});
