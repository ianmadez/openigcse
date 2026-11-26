import assert from "node:assert/strict";
import test from "node:test";

import { proposeLineage, remapResources, similarity } from "./lineage";

const draft = [
  {
    objective_code: "BI-0610-3.2.1",
    objective_text: "Explain osmosis as the net movement of water through a partially permeable membrane.",
  },
  { objective_code: "BI-0610-9.9.9", objective_text: "Volcanoes erupt magma." },
];
const extracted = [
  { objective_code: "BI-0610-3.2.1", objective_text: "Describe the role of water as a solvent in organisms" },
  {
    objective_code: "BI-0610-3.2.3",
    objective_text: "Describe osmosis as the net movement of water molecules through a partially permeable membrane",
  },
];

test("similarity ignores case, punctuation and filler words", () => {
  assert.equal(similarity("The movement of WATER.", "movement water"), 1);
  assert.equal(similarity("osmosis", "volcano"), 0);
});

test("proposes the closest new objective by wording, never by matching codes", () => {
  const lineage = proposeLineage(draft, extracted);
  assert.equal(lineage.length, 2);
  assert.equal(lineage[1]!.to_code, null, "an objective with no reasonable match has no target");
  assert.equal(lineage[0]!.from_code, "BI-0610-3.2.1");
  assert.equal(lineage[0]!.to_code, "BI-0610-3.2.3");
  assert.equal(lineage[0]!.method, "text-match");
  assert.equal(lineage[0]!.confirmed, false);
  assert.ok(lineage[0]!.score > 0.4);
});

test("an objective whose code and wording both survive maps to itself", () => {
  const lineage = proposeLineage([extracted[0]!], extracted);
  assert.deepEqual(
    lineage.map((row) => [row.from_code, row.to_code, row.method]),
    [["BI-0610-3.2.1", "BI-0610-3.2.1", "unchanged"]],
  );
});

test("resources follow the lineage and unmapped ones are reported, not guessed", () => {
  const lineage = proposeLineage(draft, extracted);
  const { kept, dropped } = remapResources(
    [
      { objective_code: "BI-0610-3.2.1", title: "Osmosis video" },
      { objective_code: "BI-0610-9.9.9", title: "Volcano video" },
    ],
    lineage,
    new Set(extracted.map((objective) => objective.objective_code)),
  );
  assert.deepEqual(kept, [{ objective_code: "BI-0610-3.2.3", title: "Osmosis video" }]);
  assert.deepEqual(dropped, [{ objective_code: "BI-0610-9.9.9", title: "Volcano video" }]);
});
