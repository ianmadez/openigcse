import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { seriesCountdown } from "./series";

describe("seriesCountdown", () => {
  const now = new Date("2026-11-17T08:00:00Z");

  test("counts whole weeks to the first day of the series month", () => {
    assert.deepEqual(seriesCountdown("June 2028", now), { monthStart: "2028-06-01", weeks: 80, passed: false });
  });

  test("a series month already under way has passed", () => {
    assert.deepEqual(seriesCountdown("November 2026", now), { monthStart: "2026-11-01", weeks: 0, passed: true });
  });

  test("an unrecognised label gives no countdown", () => {
    assert.equal(seriesCountdown("Summer 2028", now), null);
    assert.equal(seriesCountdown("", now), null);
    assert.equal(seriesCountdown(null, now), null);
  });
});
