import assert from "node:assert/strict";
import test from "node:test";

import { Rating } from "ts-fsrs";

import { dueLabel, isDue, nextCard, ratingFor, retrievabilityAt, statusFor } from "./fsrs";

const at = new Date("2026-11-24T09:00:00.000Z");
const day = 24 * 60 * 60 * 1000;

test("score_ratio maps onto the four FSRS ratings at the planned boundaries", () => {
  assert.equal(ratingFor(0), Rating.Again);
  assert.equal(ratingFor(0.49), Rating.Again);
  assert.equal(ratingFor(0.5), Rating.Hard);
  assert.equal(ratingFor(0.69), Rating.Hard);
  assert.equal(ratingFor(0.7), Rating.Good);
  assert.equal(ratingFor(0.89), Rating.Good);
  assert.equal(ratingFor(0.9), Rating.Easy);
  assert.equal(ratingFor(1), Rating.Easy);
});

test("a missing or out-of-range score cannot escape the four ratings", () => {
  assert.equal(ratingFor(-1), Rating.Again);
  assert.equal(ratingFor(Number.NaN), Rating.Again);
  assert.equal(ratingFor(2), Rating.Easy);
});

test("FSRS state maps onto the four statuses the database allows", () => {
  assert.equal(statusFor(0), "New");
  assert.equal(statusFor(1), "Learning");
  assert.equal(statusFor(2), "Review");
  assert.equal(statusFor(3), "Learning");
});

test("a first Easy answer graduates the card into a review interval", () => {
  const card = nextCard(null, { scoreRatio: 1, at });
  assert.equal(card.status, "Review");
  assert.equal(card.reps, 1);
  assert.equal(card.lapses, 0);
  assert.ok(card.scheduledDays >= 1, `scheduled ${card.scheduledDays} days`);
  assert.ok(new Date(card.dueAt).getTime() > at.getTime() + 7 * day);
  assert.equal(card.lastReviewedAt, at.toISOString());
});

test("a first Good answer stays in a short learning step", () => {
  const card = nextCard(null, { scoreRatio: 0.8, at });
  assert.equal(card.status, "Learning");
  assert.equal(card.reps, 1);
  assert.ok(new Date(card.dueAt).getTime() - at.getTime() < day);
});

test("the learning step is carried through, so a second Good graduates the card", () => {
  const first = nextCard(null, { scoreRatio: 0.8, at });
  assert.equal(first.learningSteps, 1);

  const secondAt = new Date(first.dueAt);
  const second = nextCard(first, { scoreRatio: 0.8, at: secondAt });
  assert.equal(second.status, "Review");
  assert.ok(second.scheduledDays >= 1, `scheduled ${second.scheduledDays} days`);
});

test("a wrong answer on a graduated card counts a lapse and comes back sooner", () => {
  const learned = nextCard(null, { scoreRatio: 1, at });
  const lapsed = nextCard(learned, { scoreRatio: 0.2, at: new Date(at.getTime() + 8 * day) });

  assert.equal(lapsed.lapses, 1);
  assert.equal(lapsed.reps, 2);
  assert.ok(new Date(lapsed.dueAt).getTime() < new Date(learned.dueAt).getTime() + 8 * day + day);
});

test("a second correct answer grows the stability and pushes the due date out", () => {
  const first = nextCard(null, { scoreRatio: 1, at });
  const secondAt = new Date(new Date(first.dueAt).getTime());
  const second = nextCard(first, { scoreRatio: 1, at: secondAt });

  assert.ok(second.stability > first.stability);
  assert.ok(new Date(second.dueAt).getTime() > new Date(first.dueAt).getTime());
  assert.equal(second.reps, 2);
});

test("retrievability decays between reviews and is zero for an unseen card", () => {
  const card = nextCard(null, { scoreRatio: 1, at });
  const soon = retrievabilityAt(card, new Date(at.getTime() + day));
  const later = retrievabilityAt(card, new Date(at.getTime() + 6 * day));

  assert.ok(soon > 0 && soon <= 1);
  assert.ok(later < soon, `${later} should be below ${soon}`);
  assert.equal(retrievabilityAt({ ...card, lastReviewedAt: null, stability: 0 }, at), 0);
});

test("isDue compares the stored timestamp with now", () => {
  const card = nextCard(null, { scoreRatio: 1, at });
  assert.equal(isDue(card, at), false);
  assert.equal(isDue(card, new Date(new Date(card.dueAt).getTime() + 1000)), true);
});

test("due labels stay short and honest", () => {
  assert.equal(dueLabel(at.toISOString(), at), "Due now");
  assert.equal(dueLabel(new Date(at.getTime() - 2 * day).toISOString(), at), "Overdue by 2 days");
  assert.equal(dueLabel(new Date(at.getTime() - day).toISOString(), at), "Overdue by 1 day");
  assert.equal(dueLabel(new Date(at.getTime() + 1000).toISOString(), at), "Due within a day");
  assert.equal(dueLabel(new Date(at.getTime() + 3 * day).toISOString(), at), "Due in 3 days");
});
