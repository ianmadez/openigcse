import assert from "node:assert/strict";
import { test } from "node:test";

import { checkpointKind, checkpointMessage, resolveMode } from "./resolve";

test("a resolved mistake is done", () => {
  assert.equal(resolveMode({ status: "resolved", questionType: "MCQ", hasOptions: true, correctionSubmitted: false }), "done");
});

test("an MCQ mistake with options asks for a retry", () => {
  assert.equal(resolveMode({ status: "open", questionType: "MCQ", hasOptions: true, correctionSubmitted: false }), "retry");
});

test("a mistake without a retryable question asks for a correction", () => {
  assert.equal(resolveMode({ status: "open", questionType: "Structured", hasOptions: false, correctionSubmitted: false }), "correction");
  assert.equal(resolveMode({ status: "open", questionType: null, hasOptions: false, correctionSubmitted: false }), "correction");
});

test("an MCQ whose options are hidden falls back to a correction", () => {
  assert.equal(resolveMode({ status: "open", questionType: "MCQ", hasOptions: false, correctionSubmitted: false }), "correction");
});

test("a submitted correction waits for the parent", () => {
  assert.equal(resolveMode({ status: "open", questionType: null, hasOptions: false, correctionSubmitted: true }), "waiting");
});

test("checkpoint message names the right answer when wrong", () => {
  assert.equal(checkpointMessage({ correct: true, correctOption: "B" }), "Correct.");
  assert.equal(checkpointMessage({ correct: false, correctOption: "B" }), "Not quite. The answer is B.");
  assert.equal(checkpointMessage({ correct: false, correctOption: null }), "Not quite.");
});

test("a practice task's checkpoint writes Application_Question, everything else recall", () => {
  assert.equal(checkpointKind("practice"), "practice");
  assert.equal(checkpointKind("learn"), "recall");
  assert.equal(checkpointKind("review"), "recall");
});
