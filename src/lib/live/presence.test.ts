import assert from "node:assert/strict";
import { test } from "node:test";

import { currentPeriodOf, formatCountdown, idleMinutes, isOnline, localMinutes, lockStateOf } from "./presence";

const now = new Date("2026-11-25T10:00:00Z");
test("online until three beats are missed", () => {
  assert.equal(isOnline("2026-11-25T09:58:31Z", now), true);
  assert.equal(isOnline("2026-11-25T09:58:30Z", now), false);
  assert.equal(isOnline(null, now), false);
});
test("idle minutes floor, and null when not idle", () => {
  assert.equal(idleMinutes("2026-11-25T09:44:30Z", now), 15);
  assert.equal(idleMinutes(null, now), null);
});
test("countdown reads m:ss", () => {
  assert.equal(formatCountdown(600), "10:00");
  assert.equal(formatCountdown(65), "1:05");
  assert.equal(formatCountdown(0), "0:00");
});

test("a timed unlock that has run out reads as locked", () => {
  assert.deepEqual(lockStateOf(true, null, now), { locked: true, until: null });
  assert.deepEqual(lockStateOf(false, "2026-11-25T10:15:00Z", now), { locked: false, until: "2026-11-25T10:15:00Z" });
  assert.deepEqual(lockStateOf(false, "2026-11-25T09:59:00Z", now), { locked: true, until: null });
  assert.deepEqual(lockStateOf(false, null, now), { locked: false, until: null });
});
test("local minutes follow the household time zone", () => {
  assert.equal(localMinutes(now, "Africa/Dar_es_Salaam"), 13 * 60);
  assert.equal(localMinutes(now, null), 10 * 60);
});
test("the current period is start-inclusive, end-exclusive", () => {
  const slots = [{ startMinutes: 480, endMinutes: 540 }, { startMinutes: 540, endMinutes: 600 }];
  assert.equal(currentPeriodOf(slots, 539), slots[0]);
  assert.equal(currentPeriodOf(slots, 540), slots[1]);
  assert.equal(currentPeriodOf(slots, 600), null);
});
