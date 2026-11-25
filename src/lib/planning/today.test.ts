import assert from "node:assert/strict";
import { test } from "node:test";

import { SKIP_REASONS, elapsedMinutes, groupByPeriod, reorderWithin } from "./today";

const item = (id: string, slotId: string | null, sequence: number) => ({ id, slotId, sequence });

test("skip reasons are the roadmap's three, in order", () => {
  assert.deepEqual(
    SKIP_REASONS.map((reason) => reason.value),
    ["too-hard", "no-time", "already-know"],
  );
});

test("groupByPeriod keeps periods in first-seen order and items by sequence", () => {
  const groups = groupByPeriod([item("c", "s2", 3), item("a", "s1", 2), item("b", "s1", 1), item("d", null, 4)]);
  assert.deepEqual(
    groups.map((group) => [group.slotId, group.items.map((entry) => entry.id)]),
    [
      ["s2", ["c"]],
      ["s1", ["b", "a"]],
      [null, ["d"]],
    ],
  );
});

test("reorderWithin swaps with the neighbour, reusing the period's sequence numbers, and returns only what moved", () => {
  const moves = reorderWithin([item("a", "s", 4), item("b", "s", 7), item("c", "s", 9)], "c", -1);
  assert.deepEqual(moves, [
    { id: "c", sequence: 7 },
    { id: "b", sequence: 9 },
  ]);
});

test("reorderWithin at an edge is a no-op", () => {
  assert.equal(reorderWithin([item("a", "s", 1), item("b", "s", 2)], "a", -1), null);
  assert.equal(reorderWithin([item("a", "s", 1), item("b", "s", 2)], "b", 1), null);
  assert.equal(reorderWithin([item("a", "s", 1)], "missing", 1), null);
});

test("elapsedMinutes rounds and never records less than one minute", () => {
  const start = "2026-11-24T09:00:00.000Z";
  assert.equal(elapsedMinutes(start, new Date("2026-11-24T09:00:20.000Z")), 1);
  assert.equal(elapsedMinutes(start, new Date("2026-11-24T09:24:40.000Z")), 25);
  assert.equal(elapsedMinutes(null, new Date()), 1);
  assert.equal(elapsedMinutes(start, new Date("2026-11-24T20:00:00.000Z")), 600);
});
