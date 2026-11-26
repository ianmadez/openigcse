import assert from "node:assert/strict";
import test from "node:test";

import { decideLineage, editObjective, verifyManifest } from "./review";
import type { LearningObjective, LineageEntry, Manifest } from "./schemas";

const objectives: LearningObjective[] = [
  {
    objective_code: "BI-0610-1.1.1",
    topic_code: "1.1",
    objective_text: "Describe the characteristics of living organisms",
    command_word: "Describe",
    tier: "Core",
    sequence: 1,
    supplement_text: null,
    source_page: 12,
  },
  {
    objective_code: "BI-0610-1.2.1",
    topic_code: "1.2",
    objective_text: "State that organisms can be classified",
    command_word: "State",
    tier: "Core",
    sequence: 1,
    supplement_text: null,
    source_page: 13,
  },
];

const manifest = {
  provenance: {
    method: "pdf-extraction",
    source_file: "x.pdf",
    extracted_at: "x",
    verified: false,
    notes: "",
    reviewed_by: null,
    reviewed_at: null,
  },
} as unknown as Manifest;

test("editing an objective tidies whitespace and re-reads the command word", () => {
  const result = editObjective(objectives, "BI-0610-1.1.1", "  Explain   the characteristics ");
  assert.ok(result.ok);
  assert.equal(result.value[0]!.objective_text, "Explain the characteristics");
  assert.equal(result.value[0]!.command_word, "Explain");
  assert.equal(
    objectives[0]!.objective_text,
    "Describe the characteristics of living organisms",
    "input is not mutated",
  );
});

test("editing refuses blank text and unknown codes", () => {
  assert.deepEqual(editObjective(objectives, "BI-0610-1.1.1", "short"), {
    ok: false,
    error: "An objective needs at least 8 characters.",
  });
  assert.equal(editObjective(objectives, "nope", "A long enough objective").ok, false);
});

const proposal: LineageEntry = {
  from_code: "OLD-1",
  from_text: "Old wording",
  to_code: "BI-0610-1.1.1",
  method: "text-match",
  score: 0.4,
  confirmed: false,
};

test("confirming a proposal keeps its method; retargeting makes it manual", () => {
  const same = decideLineage([proposal], objectives, "OLD-1", "BI-0610-1.1.1");
  assert.ok(same.ok);
  assert.deepEqual(same.value[0], { ...proposal, confirmed: true });

  const moved = decideLineage([proposal], objectives, "OLD-1", "BI-0610-1.2.1");
  assert.ok(moved.ok);
  assert.deepEqual(moved.value[0], {
    from_code: "OLD-1",
    from_text: "Old wording",
    to_code: "BI-0610-1.2.1",
    method: "manual",
    score: 1,
    confirmed: true,
  });
});

test("choosing no successor keeps the decision on record; a target outside the package is refused", () => {
  const none = decideLineage([proposal], objectives, "OLD-1", null);
  assert.deepEqual(none, {
    ok: true,
    value: [
      { from_code: "OLD-1", from_text: "Old wording", to_code: null, method: "manual", score: 0, confirmed: true },
    ],
  });
  assert.equal(decideLineage([proposal], objectives, "OLD-1", "BI-0610-9.9.9").ok, false);
});

test("a package cannot be verified while a link is unconfirmed", () => {
  const blocked = verifyManifest(manifest, [proposal], "Parent", new Date("2026-11-26T10:00:00Z"));
  assert.deepEqual(blocked, { ok: false, error: "Confirm or remove the 1 unconfirmed objective link first." });

  const done = verifyManifest(manifest, [{ ...proposal, confirmed: true }], "Parent", new Date("2026-11-26T10:00:00Z"));
  assert.ok(done.ok);
  assert.equal(done.value.provenance.verified, true);
  assert.equal(done.value.provenance.reviewed_by, "Parent");
  assert.equal(done.value.provenance.reviewed_at, "2026-11-26T10:00:00.000Z");
});
