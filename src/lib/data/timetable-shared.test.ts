import assert from "node:assert/strict";
import { test } from "node:test";

import { phoneSlotTimes } from "./timetable-shared";

const day = { schoolStart: 8 * 60, schoolEnd: 15 * 60 };

test("a phone edit snaps both ends to 15 minutes", () => {
  assert.deepEqual(phoneSlotTimes("09:07", "09:52", day), { ok: true, startMinutes: 9 * 60, endMinutes: 9 * 60 + 45 });
});

test("the end must come after the start", () => {
  const result = phoneSlotTimes("10:00", "10:00", day);
  assert.equal(result.ok, false);
  assert.equal(phoneSlotTimes("11:00", "10:00", day).ok, false);
});

test("a block stays inside the school day", () => {
  assert.equal(phoneSlotTimes("07:30", "09:00", day).ok, false);
  assert.equal(phoneSlotTimes("14:30", "15:30", day).ok, false);
  assert.equal(phoneSlotTimes("14:30", "15:00", day).ok, true);
});

test("an unreadable time is refused", () => {
  assert.equal(phoneSlotTimes("", "10:00", day).ok, false);
  assert.equal(phoneSlotTimes("9am", "10:00", day).ok, false);
  assert.equal(phoneSlotTimes("25:00", "26:00", day).ok, false);
});
