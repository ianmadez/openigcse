import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getSubject } from "../../src/lib/curriculum/registry";
import {
  buildEntryRoutes,
  minutesOf,
  parseAssessmentObjectives,
  parseCommandWords,
  parseComponents,
  type ParsedComponent,
} from "./assessmentParser";
import { extractItems } from "./pdfItems";
import type { TextItem } from "./syllabusParser";

function item(text: string, x: number, y: number, height = 10): TextItem {
  return { text, x, y, width: text.length * 4, height, page: 1 };
}

test("reads durations, including approximate and ranged ones", () => {
  assert.equal(minutesOf("1 hour 15 minutes"), 75);
  assert.equal(minutesOf("2 hours"), 120);
  assert.equal(minutesOf("45 minutes"), 45);
  assert.equal(minutesOf("Approximately 50 minutes"), 50);
  assert.equal(minutesOf("Approx. 10–12 minutes"), 12);
  assert.equal(minutesOf("Externally assessed"), null);
});

test("reads both card formats and the tier of each paper", () => {
  const items = [
    item("Assessment overview", 57, 745, 16),
    item("Core assessment", 57, 700),
    item("Paper 1: Multiple Choice (Core)", 62, 680),
    item("Paper 3: Theory (Core)", 309, 680),
    item("45 minutes", 62, 660),
    item("1 hour 15 minutes", 309, 660),
    item("40 marks 30%", 62, 640),
    item("80 marks 50%", 309, 640),
    item("Practical assessment", 57, 600),
    item("Paper 5: Practical Test", 62, 580),
    item("Paper 6 1 hour", 320, 580),
    item("1 hour 15 minutes", 62, 560),
    item("Alternative to Practical 20%", 320, 560),
    item("40 marks 20%", 62, 540),
    item("40 marks", 320, 540),
    item("Component 4 Approx. 10–12 minutes", 62, 500),
    item("40 marks Separately endorsed", 62, 480),
    item("Individual Talk and Conversation", 62, 460),
    item("Assessment objectives", 57, 300, 16),
  ];
  const { components } = parseComponents(items);
  const byCode = Object.fromEntries(components.map((c) => [c.component_code, c]));
  assert.deepEqual(
    [
      byCode["1"]!.name,
      byCode["1"]!.duration_minutes,
      byCode["1"]!.marks,
      byCode["1"]!.weighting_percent,
      byCode["1"]!.tier,
    ],
    ["Paper 1: Multiple Choice (Core)", 45, 40, 30, "Core"],
  );
  assert.equal(byCode["3"]!.duration_minutes, 75);
  assert.equal(byCode["5"]!.private_candidate_eligible, false, "a school practical test is not sittable privately");
  assert.deepEqual(
    [byCode["6"]!.name, byCode["6"]!.duration_minutes, byCode["6"]!.weighting_percent, byCode["6"]!.tier],
    ["Paper 6: Alternative to Practical", 60, 20, "Both"],
  );
  assert.deepEqual(
    [byCode["4"]!.name, byCode["4"]!.duration_minutes, byCode["4"]!.separately_endorsed],
    ["Component 4: Individual Talk and Conversation", 12, true],
  );
});

function paper(
  code: string,
  tier: ParsedComponent["tier"],
  weight: number | null,
  extra: Partial<ParsedComponent> = {},
): ParsedComponent {
  return {
    component_code: code,
    name: `Paper ${code}`,
    duration_minutes: 60,
    marks: 40,
    weighting_percent: weight,
    tier,
    internally_assessed: false,
    separately_endorsed: false,
    private_candidate_eligible: true,
    note: "",
    ...extra,
  };
}

test("builds one private route per tier and keeps PRIVATE for Extended", () => {
  const routes = buildEntryRoutes(
    [
      paper("1", "Core", 30),
      paper("3", "Core", 50),
      paper("2", "Extended", 30),
      paper("4", "Extended", 50),
      paper("5", "Both", 20, { private_candidate_eligible: false }),
      paper("6", "Both", 20),
    ],
    ["Core", "Extended"],
  );
  assert.deepEqual(
    routes.map((route) => [route.route_code, route.tier, route.component_codes]),
    [
      ["PRIVATE-CORE", "Core", ["1", "3", "6"]],
      ["PRIVATE", "Extended", ["2", "4", "6"]],
    ],
  );
});

test("leaves out coursework and optional endorsed components, and refuses routes that do not total 100%", () => {
  const routes = buildEntryRoutes(
    [
      paper("1", "Both", 50),
      paper("2", "Both", 50),
      paper("3", "Both", 50, { internally_assessed: true, private_candidate_eligible: false }),
      paper("4", "Both", null, { separately_endorsed: true }),
    ],
    ["Untiered"],
  );
  assert.deepEqual(
    routes.map((route) => route.component_codes),
    [["1", "2"]],
  );
  assert.deepEqual(buildEntryRoutes([paper("1", "Both", 60)], ["Untiered"]), []);
});

test("reads assessment objectives and the qualification weighting table", () => {
  const items = [
    item("Assessment objectives", 57, 745, 16),
    item("AO1 Knowledge with understanding", 57, 700),
    item("Candidates should be able to demonstrate:", 57, 684),
    item("• scientific phenomena", 57, 668),
    item("• scientific vocabulary.", 57, 652),
    item("AO2", 57, 620),
    item("Apply knowledge to a given context.", 57, 604),
    item("Weighting for assessment objectives", 57, 560),
    item("AO1 Knowledge with understanding 50", 62, 540),
    item("AO2 Handling information 30–40", 62, 520),
    item("AO1 Knowledge with understanding 63 63 0", 62, 480),
    item("Next section", 57, 300, 16),
  ];
  assert.deepEqual(parseAssessmentObjectives(items), [
    {
      code: "AO1",
      name: "Knowledge with understanding",
      description: "Candidates should be able to demonstrate: scientific phenomena; scientific vocabulary.",
      weighting_percent: 50,
    },
    {
      code: "AO2",
      name: "Handling information",
      description: "Apply knowledge to a given context. (Weighting 30–40% of the qualification.)",
      weighting_percent: null,
    },
  ]);
});

test("reads the command-word glossary with wrapped meanings", () => {
  const items = [
    item("Command words", 57, 745, 16),
    item("Command word", 62, 670),
    item("What it means", 158, 670),
    item("Calculate", 62, 647),
    item("work out from given facts", 158, 647),
    item("Explain", 62, 601),
    item("set out purposes or reasons / say why", 158, 601),
    item("and/or how", 158, 588),
    item("Next", 57, 400, 18),
  ];
  assert.deepEqual(parseCommandWords(items), [
    { word: "Calculate", meaning: "work out from given facts" },
    { word: "Explain", meaning: "set out purposes or reasons / say why and/or how" },
  ]);
});

/** Pinned against each PDF's own assessment overview; skipped when the PDF is absent. */
const EXPECTED: Record<string, { papers: string; routes: string; aos: number; words: number }> = {
  "0455": { papers: "1:60:40:30 2:120:80:70", routes: "PRIVATE=1,2", aos: 3, words: 9 },
  "0460": { papers: "1:105:75:36 2:105:75:36 3:-:60:28 4:90:60:28", routes: "PRIVATE=1,2,4", aos: 3, words: 20 },
  "0470": { papers: "1:120:60:40 2:105:40:30 3:-:40:30 4:60:40:30", routes: "PRIVATE=1,2,4", aos: 3, words: 3 },
  "0478": { papers: "1:105:75:50 2:105:75:50", routes: "PRIVATE=1,2", aos: 3, words: 13 },
  "0500": { papers: "1:120:80:50 2:120:80:50 3:-:80:50 4:12:40:-", routes: "PRIVATE=1,2", aos: 3, words: 11 },
  "0530": { papers: "1:50:40:25 2:60:40:25 3:10:40:25 4:60:40:25", routes: "PRIVATE=1,2,3,4", aos: 4, words: 0 },
  "0580": {
    papers: "1:90:80:50 2:120:100:50 3:90:80:50 4:120:100:50",
    routes: "PRIVATE-CORE=1,3 PRIVATE=2,4",
    aos: 2,
    words: 13,
  },
  "0610": {
    papers: "1:45:40:30 2:45:40:30 3:75:80:50 4:75:80:50 5:75:40:20 6:60:40:20",
    routes: "PRIVATE-CORE=1,3,6 PRIVATE=2,4,6",
    aos: 3,
    words: 14,
  },
  "0620": {
    papers: "1:45:40:30 2:45:40:30 3:75:80:50 4:75:80:50 5:75:40:20 6:60:40:20",
    routes: "PRIVATE-CORE=1,3,6 PRIVATE=2,4,6",
    aos: 3,
    words: 22,
  },
  "0625": {
    papers: "1:45:40:30 2:45:40:30 3:75:80:50 4:75:80:50 5:75:40:20 6:60:40:20",
    routes: "PRIVATE-CORE=1,3,6 PRIVATE=2,4,6",
    aos: 3,
    words: 15,
  },
};

for (const [code, expected] of Object.entries(EXPECTED)) {
  const subject = getSubject(code)!;
  const file = path.join(process.cwd(), "raw-syllabuses", subject.pdf_hint);

  test(
    `${code} ${subject.name}: papers, routes, AOs and command words`,
    { skip: !existsSync(file) && "PDF not present" },
    async () => {
      const items = await extractItems(readFileSync(file));
      const { components, warnings } = parseComponents(items);
      assert.deepEqual(warnings, []);
      const papers = [...components]
        .sort((a, b) => Number(a.component_code) - Number(b.component_code))
        .map((c) => `${c.component_code}:${c.duration_minutes ?? "-"}:${c.marks}:${c.weighting_percent ?? "-"}`)
        .join(" ");
      assert.equal(papers, expected.papers);
      const tiers = components.some((c) => c.tier === "Core")
        ? (["Core", "Extended"] as const)
        : (["Untiered"] as const);
      const routes = buildEntryRoutes(components, [...tiers])
        .map((route) => `${route.route_code}=${[...route.component_codes].sort().join(",")}`)
        .join(" ");
      assert.equal(routes, expected.routes);
      assert.equal(parseAssessmentObjectives(items).length, expected.aos);
      assert.equal(parseCommandWords(items).length, expected.words);
    },
  );
}
