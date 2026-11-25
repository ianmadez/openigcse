import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { allowanceFor, rankActivities, scoreOf, type ActivitySignal } from "./nextBestActivity";

const base: ActivitySignal = {
  objectiveCode: "X-1",
  subjectCode: "0610",
  subjectName: "Biology",
  topicName: "Topic",
  objectiveText: "Objective",
  commandWord: "Describe",
  tier: "Both",
  minutes: 20,
  mastery: 0.5,
  openMistakes: 0,
  lastStudiedDaysAgo: 3,
  daysUntilAssessment: null,
  assessmentTitle: null,
  hasLesson: true,
  reviewOverdueDays: null,
};
const s = (over: Partial<ActivitySignal>) => ({ ...base, ...over });

describe("scoreOf", () => {
  test("mastery gap is linear: 0.5 mastery scores 27.5", () => {
    assert.equal(scoreOf(base), 27.5);
    assert.equal(scoreOf(s({ mastery: 0 })), 55);
  });

  test("mastery at 0.9 or above is damped, 0.89 is not", () => {
    assert.equal(scoreOf(s({ mastery: 0.9 })), Math.round(5.5 * 0.35 * 10) / 10);
    assert.ok(scoreOf(s({ mastery: 0.89 })) > 5.5);
  });

  test("open mistakes add 12 each, capped at three", () => {
    assert.equal(scoreOf(s({ openMistakes: 1 })) - scoreOf(base), 12);
    assert.equal(scoreOf(s({ openMistakes: 3 })), scoreOf(s({ openMistakes: 9 })));
  });

  test("an assessment counts from 14 days out, not 15", () => {
    assert.equal(scoreOf(s({ daysUntilAssessment: 15 })), scoreOf(base));
    assert.equal(scoreOf(s({ daysUntilAssessment: 14 })), 37.5);
    assert.equal(scoreOf(s({ daysUntilAssessment: 0 })), 67.5);
    assert.equal(scoreOf(s({ daysUntilAssessment: -2 })), 67.5);
  });

  test("staleness steps at 7 and 14 days; never studied adds 10", () => {
    assert.equal(scoreOf(s({ lastStudiedDaysAgo: 6 })), 27.5);
    assert.equal(scoreOf(s({ lastStudiedDaysAgo: 7 })), 31.5);
    assert.equal(scoreOf(s({ lastStudiedDaysAgo: 14 })), 35.5);
    assert.equal(scoreOf(s({ lastStudiedDaysAgo: null })), 37.5);
  });

  test("a due FSRS review adds 50 plus overdue days capped at 7", () => {
    assert.equal(scoreOf(s({ reviewOverdueDays: 0 })), 77.5);
    assert.equal(scoreOf(s({ reviewOverdueDays: 3 })), 80.5);
    assert.equal(scoreOf(s({ reviewOverdueDays: 7 })), scoreOf(s({ reviewOverdueDays: 40 })));
  });

  test("no lesson subtracts 15", () => {
    assert.equal(scoreOf(s({ hasLesson: false })), 12.5);
  });
});

describe("rankActivities", () => {
  test("a due review outranks an otherwise equal objective, and says why", () => {
    const [top] = rankActivities([s({ objectiveCode: "A" }), s({ objectiveCode: "B", reviewOverdueDays: 2 })], 1);
    assert.equal(top?.objectiveCode, "B");
    assert.equal(top?.action, "review");
    assert.ok(top?.reasons.includes("Review overdue by 2 days"));
  });

  test("ties break on objective code, so the order is stable", () => {
    const ranked = rankActivities([s({ objectiveCode: "B" }), s({ objectiveCode: "A" })]);
    assert.deepEqual(ranked.map((task) => task.objectiveCode), ["A", "B"]);
  });

  test("a due review below target beats a never-studied one", () => {
    const [top] = rankActivities([
      s({ objectiveCode: "new", mastery: 0, lastStudiedDaysAgo: null }),
      s({ objectiveCode: "slipping", mastery: 0.69, reviewOverdueDays: 0, lastStudiedDaysAgo: 1 }),
    ], 1);
    assert.equal(top?.objectiveCode, "slipping");
  });

  test("a wrong checkpoint (mastery drop + mistake + due card) lifts an objective to the top", () => {
    const ranked = rankActivities([
      s({ objectiveCode: "steady", mastery: 0.6 }),
      s({ objectiveCode: "missed", mastery: 0.35, openMistakes: 1, reviewOverdueDays: 0, lastStudiedDaysAgo: 0 }),
    ]);
    assert.equal(ranked[0]?.objectiveCode, "missed");
  });
});

describe("allowanceFor", () => {
  test("no cap gives the whole period", () => assert.equal(allowanceFor(45, false, null, 300), 45));
  test("a break ignores the cap", () => assert.equal(allowanceFor(15, true, 60, 60), 15));
  test("the cap trims the last period", () => assert.equal(allowanceFor(45, false, 100, 80), 20));
  test("a spent cap gives zero, never negative", () => assert.equal(allowanceFor(45, false, 60, 90), 0));
  test("an empty period gives zero", () => assert.equal(allowanceFor(0, false, null, 0), 0));
});
