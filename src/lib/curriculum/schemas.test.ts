import assert from "node:assert/strict";
import test from "node:test";

import { curriculumPackageSchema, validatePackageIntegrity } from "./schemas";

function pkg(entryRoutes: unknown[]) {
  return curriculumPackageSchema.parse({
    manifest: {
      schema_version: "2.0.0",
      package_id: "0000-test-2026-2028",
      subject: {
        code: "0000",
        slug: "test",
        name: "Test",
        qualification: "IGCSE",
        awarding_body: "Cambridge",
        version_label: "2026-2028",
        exam_series: ["June"],
        tiers: ["Untiered"],
        grade_scale: "A*-G",
        mastery_mode: "objective-mastery",
      },
      provenance: { method: "pdf-extraction", source_file: "x.pdf", extracted_at: "2026-11-26", verified: false },
      counts: { topics: 0, subtopics: 0, objectives: 0, components: 2, assessment_objectives: 0 },
      generated_at: "2026-11-26",
    },
    routes: [
      {
        component_code: "1",
        name: "Paper 1",
        duration_minutes: 60,
        weighting_percent: 60,
        tier: "Both",
        assessment_style: "written",
        private_candidate_eligible: true,
        marks: 40,
      },
      {
        component_code: "2",
        name: "Paper 2",
        duration_minutes: 60,
        weighting_percent: 40,
        tier: "Both",
        assessment_style: "written",
        private_candidate_eligible: true,
      },
    ],
    entryRoutes,
    assessmentObjectives: [],
    topics: [],
    objectives: [],
  });
}

const route = (codes: string[]) => ({
  route_code: "PRIVATE",
  name: "Private",
  tier: "Untiered",
  private_candidate_eligible: true,
  component_codes: codes,
});

test("packages without entry_routes.json and marks still parse", () => {
  const parsed = pkg([]);
  assert.deepEqual(parsed.entryRoutes, []);
  assert.equal(parsed.routes[1]!.marks, null);
});

test("an entry route must name real papers whose weightings total 100", () => {
  assert.deepEqual(validatePackageIntegrity(pkg([route(["1", "2"])])), []);
  assert.deepEqual(validatePackageIntegrity(pkg([route(["1"])])), [
    "entry route PRIVATE: weightings sum to 60, not 100",
  ]);
  assert.deepEqual(validatePackageIntegrity(pkg([route(["1", "9"])])), ["entry route PRIVATE: unknown component 9"]);
});
