import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { autoMarkMcq, estimateGrade, objectiveRatios, pickWeakest, validateMarks } from "./scoring";

describe("autoMarkMcq", () => {
  test("the correct letter earns full marks", () => {
    assert.equal(autoMarkMcq("B", "B", 2), 2);
  });

  test("a wrong letter earns nothing", () => {
    assert.equal(autoMarkMcq("A", "B", 1), 0);
  });

  test("a blank answer earns nothing", () => {
    assert.equal(autoMarkMcq(null, "B", 1), 0);
  });
});

describe("validateMarks", () => {
  const full = { questionId: "q1", available: 2, awarded: 2, errorCategory: null };

  test("full marks need no reason", () => {
    assert.deepEqual(validateMarks([full]), { ok: true });
  });

  test("a half mark is refused", () => {
    const result = validateMarks([{ ...full, awarded: 1.5, errorCategory: "ConceptGap" }]);
    assert.equal(result.ok, false);
  });

  test("more than the item is worth is refused", () => {
    assert.equal(validateMarks([{ ...full, awarded: 3 }]).ok, false);
  });

  test("a negative mark is refused", () => {
    assert.equal(validateMarks([{ ...full, awarded: -1, errorCategory: "ConceptGap" }]).ok, false);
  });

  test("a dropped mark without a reason is refused and names the question", () => {
    const result = validateMarks([{ ...full, awarded: 1 }]);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /reason/i);
    assert.equal(result.ok ? null : result.questionId, "q1");
  });

  test("a dropped mark with a reason is accepted", () => {
    assert.deepEqual(validateMarks([{ ...full, awarded: 0, errorCategory: "CalculationSlip" }]), { ok: true });
  });

  test("an unmarked item is refused", () => {
    assert.equal(validateMarks([{ ...full, awarded: null }]).ok, false);
  });
});

describe("objectiveRatios", () => {
  test("pools marks across items on the same objective", () => {
    const ratios = objectiveRatios([
      { objectiveId: "o1", available: 3, awarded: 2 },
      { objectiveId: "o1", available: 1, awarded: 1 },
      { objectiveId: "o2", available: 2, awarded: 1 },
      { objectiveId: null, available: 5, awarded: 0 },
    ]);
    assert.equal(ratios.get("o1"), 0.75);
    assert.equal(ratios.get("o2"), 0.5);
    assert.equal(ratios.size, 2);
  });
});

describe("estimateGrade", () => {
  const thresholds = [
    { grade: "B", minPercent: 60 },
    { grade: "A", minPercent: 70 },
  ];

  test("picks the highest grade whose threshold is met", () => {
    assert.equal(estimateGrade(65, thresholds), "B");
    assert.equal(estimateGrade(70, thresholds), "A");
  });

  test("below every threshold there is no estimate", () => {
    assert.equal(estimateGrade(40, thresholds), null);
  });

  test("without thresholds there is no estimate", () => {
    assert.equal(estimateGrade(95, []), null);
  });
});

describe("pickWeakest", () => {
  const candidates = [
    { id: "strong", objectiveId: "o-strong" },
    { id: "unseen-1", objectiveId: "o-unseen" },
    { id: "weak", objectiveId: "o-weak" },
    { id: "unseen-2", objectiveId: "o-unseen-2" },
  ];
  const ratios = new Map([
    ["o-strong", 0.95],
    ["o-weak", 0.3],
  ]);

  test("unseen objectives first, then weakest, keeping input order on ties", () => {
    assert.deepEqual(pickWeakest(candidates, ratios, 3), ["unseen-1", "unseen-2", "weak"]);
  });

  test("never returns more than it was given", () => {
    assert.equal(pickWeakest(candidates, ratios, 10).length, 4);
  });
});
