import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { initialMarks } from "./marking";

const mcq = { questionId: "m", kind: "MCQ", available: 1, correctOption: "B", selectedOption: "B" };
const wrongMcq = { ...mcq, questionId: "w", selectedOption: "C" };
const blankMcq = { ...mcq, questionId: "b", selectedOption: null };
const written = { questionId: "s", kind: "ShortAnswer", available: 3, correctOption: null, selectedOption: null };

describe("initialMarks", () => {
  test("multiple choice is marked from the learner's choice", () => {
    const marks = initialMarks([mcq, wrongMcq, blankMcq], new Map(), new Map());
    assert.equal(marks.m?.awarded, 1);
    assert.equal(marks.w?.awarded, 0);
    assert.equal(marks.b?.awarded, 0);
    assert.equal(marks.m?.auto, true);
  });

  test("a wrong multiple-choice answer starts as a concept gap so it reaches the notebook", () => {
    const marks = initialMarks([wrongMcq], new Map(), new Map());
    assert.equal(marks.w?.errorCategory, "ConceptGap");
  });

  test("written answers wait for the parent", () => {
    const marks = initialMarks([written], new Map(), new Map());
    assert.equal(marks.s?.awarded, null);
    assert.equal(marks.s?.auto, false);
  });

  test("saved marks, feedback and reasons win over the automatic ones", () => {
    const marks = initialMarks(
      [wrongMcq, written],
      new Map([
        ["w", { awarded: 1, feedback: "Accepted on appeal" }],
        ["s", { awarded: 2, feedback: "Missing the unit" }],
      ]),
      new Map([["s", "CalculationSlip" as const]]),
    );
    assert.deepEqual(marks.w, { awarded: 1, feedback: "Accepted on appeal", errorCategory: null, auto: false });
    assert.deepEqual(marks.s, { awarded: 2, feedback: "Missing the unit", errorCategory: "CalculationSlip", auto: false });
  });
});
