import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { toQuestionRow, type QuestionInput } from "./question";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OBJECTIVE = "22222222-2222-4222-8222-222222222222";

const base: QuestionInput = {
  kind: "ShortAnswer",
  objectiveId: OBJECTIVE,
  assessmentObjectiveId: null,
  tier: "Both",
  difficulty: "Standard",
  prompt: "State the function of the mitochondria.",
  options: [],
  correctOption: null,
  parts: [],
  marks: 1,
  modelAnswer: "Aerobic respiration",
  markScheme: "1 mark: respiration / releases energy",
  imagePaths: [],
};

function row(input: Partial<QuestionInput>) {
  return toQuestionRow({ ...base, ...input }, HOUSEHOLD);
}

describe("toQuestionRow", () => {
  test("a short answer keeps its marks, model answer and household", () => {
    const result = row({});
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.row.question_type, "ShortAnswer");
    assert.equal(result.row.max_marks, 1);
    assert.equal(result.row.model_answer, "Aerobic respiration");
    assert.equal(result.row.household_id, HOUSEHOLD);
  });

  test("a short answer without a model answer is refused", () => {
    assert.equal(row({ modelAnswer: "  " }).ok, false);
  });

  test("an empty prompt is refused", () => {
    assert.equal(row({ prompt: " " }).ok, false);
  });

  test("an MCQ stores its options with exactly the chosen letter marked correct", () => {
    const result = row({
      kind: "MCQ",
      options: [
        { letter: "A", text: "Nucleus" },
        { letter: "B", text: "Mitochondrion" },
        { letter: "C", text: "Ribosome" },
      ],
      correctOption: "B",
      modelAnswer: "",
      markScheme: "",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.row.options_schema, [
      { letter: "A", text: "Nucleus", correct: false },
      { letter: "B", text: "Mitochondrion", correct: true },
      { letter: "C", text: "Ribosome", correct: false },
    ]);
    assert.equal(result.row.mark_scheme_rubric, "Correct answer: B");
  });

  test("an MCQ whose answer is not one of its options is refused", () => {
    const result = row({
      kind: "MCQ",
      options: [
        { letter: "A", text: "x" },
        { letter: "B", text: "y" },
      ],
      correctOption: "D",
    });
    assert.equal(result.ok, false);
  });

  test("an MCQ with a blank option is refused", () => {
    const result = row({
      kind: "MCQ",
      options: [
        { letter: "A", text: "x" },
        { letter: "B", text: " " },
      ],
      correctOption: "A",
    });
    assert.equal(result.ok, false);
  });

  test("a structured question is worth the sum of its parts", () => {
    const result = row({
      kind: "Structured",
      marks: 99,
      parts: [
        { label: "a", prompt: "Name it", marks: 1 },
        { label: "b", prompt: "Explain it", marks: 3 },
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.row.max_marks, 4);
  });

  test("a structured question needs at least one part", () => {
    assert.equal(row({ kind: "Structured", parts: [] }).ok, false);
  });

  test("an image outside this household's question folder is refused", () => {
    assert.equal(row({ imagePaths: ["someone-else/questions/x/y.png"] }).ok, false);
    assert.equal(row({ imagePaths: [`${HOUSEHOLD}/questions/abc/diagram.png`] }).ok, true);
  });
});
