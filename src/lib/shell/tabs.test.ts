import assert from "node:assert/strict";
import { test } from "node:test";

import { activeTab, tabsFor } from "./tabs";

test("each role has the roadmap's five tabs, More last", () => {
  assert.deepEqual(
    tabsFor("student").map((tab) => tab.label),
    ["Today", "Timetable", "Review", "Inbox", "More"],
  );
  assert.deepEqual(
    tabsFor("parent").map((tab) => tab.label),
    ["Live", "Inbox", "Marking", "Timetable", "More"],
  );
  for (const variant of ["student", "parent"] as const) {
    assert.equal(tabsFor(variant).at(-1)?.href, null);
  }
});

test("a direct tab owns its route and sub-routes", () => {
  assert.equal(activeTab("student", "/today"), "today");
  assert.equal(activeTab("student", "/messages"), "inbox");
  assert.equal(activeTab("parent", "/parent/marking-desk/abc"), "marking");
  assert.equal(activeTab("parent", "/parent/live"), "live");
});

test("a prefix that is not a path segment does not match", () => {
  assert.equal(activeTab("student", "/todayish"), "more");
  assert.equal(activeTab("parent", "/parent/timetable-old"), "more");
});

test("everything else lights More", () => {
  assert.equal(activeTab("student", "/subjects/biology"), "more");
  assert.equal(activeTab("parent", "/parent"), "more");
  assert.equal(activeTab("parent", "/parent/settings"), "more");
});
