import assert from "node:assert/strict";
import { test } from "node:test";

import { inQuietHours } from "./quiet";

// 2026-11-25 20:30 UTC is 23:30 in Dar es Salaam (UTC+3).
const late = new Date("2026-11-25T20:30:00Z");
const morning = new Date("2026-11-25T04:30:00Z"); // 07:30 local

test("no window means never quiet", () => {
  assert.equal(inQuietHours(late, "Africa/Dar_es_Salaam", null, "07:00"), false);
  assert.equal(inQuietHours(late, "Africa/Dar_es_Salaam", "21:00", "21:00"), false);
});
test("a window across midnight uses the household's local time", () => {
  assert.equal(inQuietHours(late, "Africa/Dar_es_Salaam", "21:00", "07:00"), true);
  assert.equal(inQuietHours(morning, "Africa/Dar_es_Salaam", "21:00", "07:00"), false);
});
test("a same-day window is start-inclusive and end-exclusive", () => {
  assert.equal(inQuietHours(new Date("2026-11-25T10:00:00Z"), "UTC", "10:00", "12:00"), true);
  assert.equal(inQuietHours(new Date("2026-11-25T12:00:00Z"), "UTC", "10:00:00", "12:00:00"), false);
});
