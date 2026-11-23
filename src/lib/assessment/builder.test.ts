import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseThresholds, questionEditBlock, sittingState } from "./builder";

describe("parseThresholds", () => {
  test("keeps valid rows, highest first, and drops blank rows", () => {
    assert.deepEqual(
      parseThresholds([
        { grade: "B", minPercent: 60 },
        { grade: "", minPercent: null },
        { grade: "A*", minPercent: 80 },
        { grade: "A", minPercent: 70 },
      ]),
      {
        ok: true,
        thresholds: [
          { grade: "A*", minPercent: 80 },
          { grade: "A", minPercent: 70 },
          { grade: "B", minPercent: 60 },
        ],
      },
    );
  });

  test("refuses a grade given twice", () => {
    assert.equal(parseThresholds([{ grade: "A", minPercent: 70 }, { grade: "A", minPercent: 60 }]).ok, false);
  });

  test("refuses two grades on the same percentage", () => {
    assert.equal(parseThresholds([{ grade: "A", minPercent: 70 }, { grade: "B", minPercent: 70 }]).ok, false);
  });

  test("refuses a percentage outside 0 to 100", () => {
    assert.equal(parseThresholds([{ grade: "A", minPercent: 101 }]).ok, false);
    assert.equal(parseThresholds([{ grade: "A", minPercent: -1 }]).ok, false);
  });

  test("refuses a grade with no percentage", () => {
    assert.equal(parseThresholds([{ grade: "A", minPercent: null }]).ok, false);
  });
});

describe("sittingState", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  const base = { status: "Scheduled", durationMinutes: 30, sitting: null };

  test("draft and marked come from the assessment", () => {
    assert.equal(sittingState({ ...base, status: "Draft" }, now), "draft");
    assert.equal(sittingState({ ...base, status: "Marked" }, now), "marked");
  });

  test("scheduled until a sitting starts", () => {
    assert.equal(sittingState(base, now), "scheduled");
  });

  test("in progress while inside the time", () => {
    const sitting = { startedAt: "2026-11-17T09:45:00Z", submittedAt: null };
    assert.equal(sittingState({ ...base, sitting }, now), "in_progress");
  });

  test("handed in when submitted", () => {
    const sitting = { startedAt: "2026-11-17T09:45:00Z", submittedAt: "2026-11-17T09:55:00Z" };
    assert.equal(sittingState({ ...base, sitting }, now), "handed_in");
  });

  test("handed in when the time ran out without a submit", () => {
    const sitting = { startedAt: "2026-11-17T09:00:00Z", submittedAt: null };
    assert.equal(sittingState({ ...base, sitting }, now), "handed_in");
  });
});

describe("questionEditBlock", () => {
  test("a question on drafts or scheduled papers can change", () => {
    assert.equal(questionEditBlock(["draft", "scheduled"]), null);
  });

  test("a question on a paper being sat, handed in or marked cannot", () => {
    for (const state of ["in_progress", "handed_in", "marked"] as const) {
      assert.match(questionEditBlock(["scheduled", state]) ?? "", /sat|marked/);
    }
  });
});
