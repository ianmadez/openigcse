import assert from "node:assert/strict";
import test from "node:test";

import {
  blendMastery,
  eventMasteryOf,
  objectiveMasteryOf,
  readinessOf,
  recencyWeight,
  retrievabilityOf,
} from "./mastery";
import { nextCard, retrievabilityAt } from "./fsrs";

const now = new Date("2026-11-24T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(now.getTime() - days * day).toISOString();

test("each event type carries its planned weight", () => {
  assert.equal(eventMasteryOf([{ eventType: "Formal_Assessment", scoreRatio: 1, at: ago(0) }], now), 1);
  assert.equal(eventMasteryOf([{ eventType: "Application_Question", scoreRatio: 1, at: ago(0) }], now), 1);
  assert.equal(eventMasteryOf([{ eventType: "Active_Recall", scoreRatio: 0.5, at: ago(0) }], now), 0.5);
});

test("lessons and corrections add no score", () => {
  assert.equal(eventMasteryOf([{ eventType: "Exposure_Lesson", scoreRatio: 0, at: ago(0) }], now), 0);
  assert.equal(
    eventMasteryOf(
      [
        { eventType: "Active_Recall", scoreRatio: 1, at: ago(0) },
        { eventType: "Error_Correction", scoreRatio: 0, at: ago(0) },
      ],
      now,
    ),
    1,
  );
});

test("an event 30 days old counts half as much as a fresh one", () => {
  assert.equal(recencyWeight(ago(0), now), 1);
  assert.equal(recencyWeight(ago(30), now), 0.5);
  assert.equal(recencyWeight(ago(60), now), 0.25);

  const mastery = eventMasteryOf(
    [
      { eventType: "Active_Recall", scoreRatio: 1, at: ago(0) },
      { eventType: "Active_Recall", scoreRatio: 0, at: ago(30) },
    ],
    now,
  );
  assert.ok(Math.abs(mastery - 2 / 3) < 1e-9, `expected 2/3, got ${mastery}`);
});

test("the formal assessment outweighs a recall on the same objective", () => {
  const mastery = eventMasteryOf(
    [
      { eventType: "Formal_Assessment", scoreRatio: 0, at: ago(0) },
      { eventType: "Active_Recall", scoreRatio: 1, at: ago(0) },
    ],
    now,
  );
  // 0.6 recalled of 1.6 weighted: the paper's zero pulls it down.
  assert.ok(Math.abs(mastery - 0.375) < 1e-9, `expected 0.375, got ${mastery}`);
});

test("a score outside 0-1 cannot escape the bounds", () => {
  assert.equal(eventMasteryOf([{ eventType: "Active_Recall", scoreRatio: 2, at: ago(0) }], now), 1);
  assert.equal(eventMasteryOf([{ eventType: "Active_Recall", scoreRatio: -1, at: ago(0) }], now), 0);
});

test("mastery is 70% events and 30% retrievability", () => {
  assert.ok(Math.abs(blendMastery(0.5, 1) - 0.65) < 1e-12);
  assert.equal(blendMastery(0, 0), 0);
  assert.ok(Math.abs(blendMastery(1, 0) - 0.7) < 1e-12);

  const { eventMastery, mastery } = objectiveMasteryOf(
    [{ eventType: "Formal_Assessment", scoreRatio: 1, at: ago(0) }],
    0.5,
    now,
  );
  assert.equal(eventMastery, 1);
  assert.ok(Math.abs(mastery - 0.85) < 1e-12);
});

test("readiness is coverage times mean mastery", () => {
  assert.deepEqual(readinessOf(5, 10, 0.8), { coverage: 0.5, readiness: 0.4 });
  assert.deepEqual(readinessOf(0, 0, 0.8), { coverage: 0, readiness: 0 });
  assert.deepEqual(readinessOf(3, 3, 1), { coverage: 1, readiness: 1 });
});

test("the SQL forgetting curve matches ts-fsrs, including its whole-day floor", () => {
  const at = new Date("2026-11-01T00:00:00.000Z");
  const card = nextCard(null, { scoreRatio: 1, at });

  for (const days of [0.2, 0.99, 1, 1.5, 3, 14, 30]) {
    const moment = new Date(at.getTime() + days * day);
    const mine = retrievabilityOf(card, moment);
    const library = retrievabilityAt(card, moment);
    assert.ok(Math.abs(mine - library) < 1e-6, `${days} days: ${mine} vs ${library}`);
  }
});
