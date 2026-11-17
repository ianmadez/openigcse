import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { secondsLeft, toSittingQuestion } from "./sitting";

describe("toSittingQuestion", () => {
  const row = {
    id: "q1",
    question_type: "MCQ",
    prompt_template: "Which organelle releases energy?",
    options_schema: [
      { letter: "A", text: "Nucleus", correct: false },
      { letter: "B", text: "Mitochondrion", correct: true },
    ],
    parts: [],
    image_paths: ["h/questions/p/x.png"],
    model_answer: "B",
    mark_scheme_rubric: "Correct answer: B",
  };

  test("carries the options without saying which is correct", () => {
    const question = toSittingQuestion(row, 1, 1);
    assert.deepEqual(question.options, [
      { letter: "A", text: "Nucleus" },
      { letter: "B", text: "Mitochondrion" },
    ]);
    const serialised = JSON.stringify(question);
    assert.doesNotMatch(serialised, /correct/i);
    assert.doesNotMatch(serialised, /Correct answer/);
    assert.equal("modelAnswer" in question, false);
    assert.equal("markScheme" in question, false);
  });

  test("keeps the number, marks, prompt and parts the learner needs", () => {
    const question = toSittingQuestion(
      { ...row, question_type: "Structured", options_schema: null, parts: [{ label: "a", prompt: "Name it", marks: 2 }] },
      3,
      2,
    );
    assert.equal(question.number, 3);
    assert.equal(question.marks, 2);
    assert.deepEqual(question.parts, [{ label: "a", prompt: "Name it", marks: 2 }]);
    assert.deepEqual(question.options, []);
  });
});

describe("secondsLeft", () => {
  test("counts down from the server's start time", () => {
    assert.equal(secondsLeft("2026-11-17T10:00:00Z", 30, new Date("2026-11-17T10:10:00Z")), 20 * 60);
  });

  test("never goes below zero", () => {
    assert.equal(secondsLeft("2026-11-17T10:00:00Z", 30, new Date("2026-11-17T11:00:00Z")), 0);
  });
});
