import assert from "node:assert/strict";
import { test } from "node:test";

import { todayIso } from "./dates";

// 23:30 UTC on the 23rd is already the 24th in Harare (UTC+2) and still the 23rd in New York.
const lateUtc = new Date("2026-11-23T23:30:00Z");

test("todayIso follows the household timezone, not UTC", () => {
  assert.equal(todayIso(lateUtc, "Africa/Harare"), "2026-11-24");
  assert.equal(todayIso(lateUtc, "America/New_York"), "2026-11-23");
});

test("todayIso falls back to UTC without a usable timezone", () => {
  assert.equal(todayIso(lateUtc), "2026-11-23");
  assert.equal(todayIso(lateUtc, null), "2026-11-23");
  assert.equal(todayIso(lateUtc, "Not/AZone"), "2026-11-23");
});
