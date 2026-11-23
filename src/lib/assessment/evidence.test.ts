import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EVIDENCE_LABEL, checkEvidence } from "./evidence";

describe("checkEvidence", () => {
  test("needs a title", () => {
    assert.equal(checkEvidence({ title: " ", typedResponse: "notes", hasFile: false }).ok, false);
  });

  test("needs a file or some writing", () => {
    assert.equal(checkEvidence({ title: "Osmosis practical", typedResponse: "  ", hasFile: false }).ok, false);
    assert.equal(checkEvidence({ title: "Osmosis practical", typedResponse: "", hasFile: true }).ok, true);
    assert.equal(checkEvidence({ title: "Osmosis practical", typedResponse: "My write-up", hasFile: false }).ok, true);
  });
});

describe("EVIDENCE_LABEL", () => {
  test("NeedsCorrection reads as the roadmap's Changes requested", () => {
    assert.equal(EVIDENCE_LABEL.NeedsCorrection, "Changes requested");
    assert.equal(EVIDENCE_LABEL.Submitted, "Submitted");
    assert.equal(EVIDENCE_LABEL.Approved, "Approved");
  });
});
