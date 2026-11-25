import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { REQUESTS, REQUEST_TYPES, decisionLabel, outcomeOf, secondsUntil } from "./catalog";

describe("request catalogue", () => {
  test("covers the roadmap's seven types", () => {
    assert.deepEqual([...REQUEST_TYPES].sort(), ["break", "check_work", "day_off", "more_time", "stuck", "swap", "unlock"]);
    for (const type of REQUEST_TYPES) assert.ok(REQUESTS[type].decisions.length > 0, type);
  });

  // Mirrors request_decision_outcome() in the Phase 5 migration.
  const sql: Array<[string, string, "approved" | "declined" | null]> = [
    ["stuck", "coming", "approved"], ["stuck", "hint", "approved"], ["stuck", "skip", "approved"],
    ["break", "5", "approved"], ["break", "10", "approved"], ["break", "15", "approved"], ["break", "not_now", "declined"],
    ["more_time", "approve", "approved"], ["more_time", "decline", "declined"],
    ["swap", "approve", "approved"], ["swap", "decline", "declined"],
    ["unlock", "15", "approved"], ["unlock", "30", "approved"], ["unlock", "decline", "declined"],
    ["check_work", "reviewing", "approved"],
    ["day_off", "approve", "approved"], ["day_off", "call_me", "declined"],
    ["break", "20", null], ["stuck", "approve", null], ["day_off", "decline", null],
  ];
  for (const [type, decision, expected] of sql) {
    test(`${type} + ${decision} -> ${expected}`, () => assert.equal(outcomeOf(type as never, decision), expected));
  }

  test("every catalogue answer is one the SQL accepts", () => {
    const accepted = new Set(sql.filter(([, , outcome]) => outcome).map(([t, d]) => `${t}:${d}`));
    for (const type of REQUEST_TYPES) {
      for (const decision of REQUESTS[type].decisions) assert.ok(accepted.has(`${type}:${decision.value}`), `${type}:${decision.value}`);
    }
  });

  test("decision labels read as the parent tapped them", () => {
    assert.equal(decisionLabel("break", "10"), "10 min");
    assert.equal(decisionLabel("break", null), null);
    assert.equal(decisionLabel("nonsense", "x"), null);
  });

  test("countdown is whole seconds and never negative", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    assert.equal(secondsUntil("2026-11-25T10:10:00Z", now), 600);
    assert.equal(secondsUntil("2026-11-25T10:00:00.400Z", now), 1);
    assert.equal(secondsUntil("2026-11-25T09:00:00Z", now), 0);
    assert.equal(secondsUntil(null, now), 0);
  });
});
