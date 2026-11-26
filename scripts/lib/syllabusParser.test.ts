import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getSubject } from "../../src/lib/curriculum/registry";
import { extractItems } from "./pdfItems";
import { commandWordOf, groupLines, parseSyllabus, type ParseResult, type TextItem } from "./syllabusParser";

const BULLET = "• ";

function item(text: string, x: number, y: number, height = 10, page = 1): TextItem {
  return { text, x, y, width: text.length * 4, height, page };
}

const heading = (y: number) => [item("3", 57, y, 18), item("Subject content", 76, y, 18)];
const nextSection = (y: number) => [item("4", 57, y, 18), item("Details of the assessment", 76, y, 18)];

function objectives(result: ParseResult) {
  return result.topics.flatMap((topic) => topic.subtopics.flatMap((sub) => sub.objectives));
}

test("keeps Core and Supplement cells apart when they share a baseline", () => {
  const lines = groupLines([item("1 State a fact", 62, 600), item("5 Explain a fact", 309, 600)], { splitX: 300 });
  assert.deepEqual(
    lines.map((line) => [line.side, line.text]),
    [
      [0, "1 State a fact"],
      [1, "5 Explain a fact"],
    ],
  );
});

test("reports a missing section instead of inventing one", () => {
  assert.throws(() => parseSyllabus([item("Contents", 60, 700)], "science"), /Subject content/);
});

test("ignores the contents-page entry and stops at the next numbered section", () => {
  const items = [
    item("3 Subject content ........ 12", 57, 700),
    ...heading(650),
    item("1", 62, 620, 13),
    item("Basics", 91, 620, 13),
    item("1.1 Scarcity", 62, 600),
    item("1.1.1 Finite resources", 62, 580),
    ...nextSection(540),
    item("1.1.2 Not content", 62, 520),
  ];
  const result = parseSyllabus(items, "decimal");
  assert.deepEqual(
    objectives(result).map((objective) => objective.local_code),
    ["1.1.1"],
  );
});

test("decimal layout: three-level codes become objectives and bullets join their text", () => {
  const items = [
    ...heading(750),
    item("1", 62, 700, 13),
    item("The basic economic problem", 91, 700, 13),
    item("This topic introduces the ideas.", 62, 680),
    item("1.1 The nature of the problem", 62, 660),
    item("1.1.1 Finite resources and infinite wants", 62, 640),
    item(`${BULLET}definition of the basic economic problem`, 91, 620),
    item(`${BULLET}the concept of scarcity`, 91, 600),
    item("1.1.2 Economic goods", 62, 580),
  ];
  const result = parseSyllabus(items, "decimal");
  assert.equal(result.topics[0]!.name, "The basic economic problem");
  assert.deepEqual(
    objectives(result).map((objective) => objective.text),
    [
      "Finite resources and infinite wants: definition of the basic economic problem; the concept of scarcity",
      "Economic goods",
    ],
  );
});

test("science layout: left column is Core, right column is Supplement, codes carry statement numbers", () => {
  const items = [
    ...heading(750),
    item("1", 62, 700, 13),
    item("Characteristics of living organisms", 91, 700, 13),
    item("1.1", 62, 680),
    item("Characteristics", 85, 680),
    item("Core", 62, 660),
    item("Supplement", 309, 660),
    item("1", 62, 640),
    item("Describe the characteristics", 79, 640),
    item("5", 309, 640),
    item("Explain classification", 326, 640),
    item("of living organisms", 79, 626),
    item("2", 62, 610),
    item("State that organisms grow", 79, 610),
    item("2", 62, 560, 13),
    item("Cells", 91, 560, 13),
    item("2.1", 62, 540),
    item("Cell structure", 85, 540),
    item("1", 62, 520),
    item("Describe a cell", 79, 520),
  ];
  const result = parseSyllabus(items, "science");
  assert.equal(result.mode, "tiered");
  assert.deepEqual(
    objectives(result).map((objective) => [objective.local_code, objective.tier, objective.text]),
    [
      ["1.1.1", "Core", "Describe the characteristics of living organisms"],
      ["1.1.5", "Extended", "Explain classification"],
      ["1.1.2", "Core", "State that organisms grow"],
      ["2.1.1", "Core", "Describe a cell"],
    ],
  );
});

test("science layout: an empty parent subtopic gives way to its three-level children", () => {
  const items = [
    ...heading(750),
    item("1", 62, 700, 13),
    item("Motion", 91, 700, 13),
    item("1.5 Forces", 62, 680),
    item("1.5.1 Effects of forces", 62, 660),
    item("1", 62, 640),
    item("Know that forces change shape", 79, 640),
  ];
  const result = parseSyllabus(items, "science");
  assert.deepEqual(
    result.topics[0]!.subtopics.map((sub) => sub.topic_code),
    ["1.5.1"],
  );
  assert.equal(objectives(result)[0]!.local_code, "1.5.1.1");
});

test("cs layout: the objective column is whichever side carries 'Candidates should be able to'", () => {
  const items = [
    ...heading(750),
    item("1", 62, 700, 13),
    item("Data representation", 91, 700, 13),
    item("1.1", 62, 680),
    item("Number systems", 85, 680),
    item("Notes and guidance", 62, 660),
    item("Candidates should be able to:", 309, 660),
    item("• Binary is base 2", 62, 640),
    item("1", 309, 640),
    item("Understand binary", 326, 640),
    // Next page swaps the columns.
    item("1.1", 62, 740, 10, 2),
    item("Number systems continued", 85, 740, 10, 2),
    item("Candidates should be able to:", 62, 720, 10, 2),
    item("Notes and guidance", 309, 720, 10, 2),
    item("2", 62, 700, 10, 2),
    item("Convert between bases", 79, 700, 10, 2),
    item("• Denary to binary", 309, 700, 10, 2),
    item("7", 62, 650, 13, 2),
    item("Algorithm design", 91, 650, 13, 2),
    item("1", 62, 630, 10, 2),
    item("Understand the program development life cycle", 79, 630, 10, 2),
  ];
  const result = parseSyllabus(items, "cs");
  assert.deepEqual(
    objectives(result).map((objective) => [objective.local_code, objective.text]),
    [
      ["1.1.1", "Understand binary"],
      ["1.1.2", "Convert between bases"],
      ["7.1", "Understand the program development life cycle"],
    ],
  );
  assert.equal(result.topics[1]!.subtopics[0]!.topic_code, "7.0");
});

test("maths layout: C/E prefixes, notes column ignored, stems own numbered lists", () => {
  const items = [
    ...heading(780),
    item("Core subject content", 57, 760, 13),
    item("1", 62, 740, 13),
    item("Number", 79, 740, 13),
    item("C1.1", 62, 720),
    item("Types of number", 96, 720),
    item("Notes and examples", 309, 720),
    item("Identify and use:", 62, 700),
    item("• convert numbers and words", 309, 700),
    item("• natural numbers", 62, 686),
    item("• integers", 62, 672),
    item("C1.2", 62, 650),
    item("Extended content only.", 96, 650),
    item("Extended subject content", 57, 600, 13),
    item("1", 62, 580, 13),
    item("Number", 79, 580, 13),
    item("E1.1", 62, 560),
    item("Exact values", 96, 560),
    item("Know the exact values of:", 62, 540),
    item("1", 62, 526),
    item("sin x for x = 0°.", 73, 526),
    item("2", 62, 512),
    item("tan x for x = 0°.", 73, 512),
    item("E1.2", 62, 490),
    item("Money", 96, 490),
    item("1", 62, 470),
    item("Calculate with money.", 73, 470),
  ];
  const result = parseSyllabus(items, "maths");
  assert.deepEqual(
    result.topics.map((topic) => topic.topic_code),
    ["C1", "E1"],
  );
  assert.deepEqual(
    objectives(result).map((objective) => [objective.local_code, objective.tier, objective.text]),
    [
      ["C1.1.1", "Core", "Identify and use: natural numbers; integers"],
      ["E1.1.1", "Extended", "Know the exact values of: sin x for x = 0°; tan x for x = 0°."],
      ["E1.2.1", "Extended", "Calculate with money."],
    ],
  );
});

test("history layout: key questions hold specified content, depth studies fall back to focus points", () => {
  const items = [
    ...heading(790),
    item("Core content: Option A", 57, 770, 16),
    item("The nineteenth century", 57, 752),
    item("1 Were the revolutions of 1848 important?", 57, 735),
    item("1 Were the revolutions of 1848 important?", 62, 715),
    item("Focus points", 62, 700),
    item("• Why had liberalism grown?", 62, 685),
    item("Specified content", 62, 670),
    item("• Causes, events and results of revolutions in:", 62, 655),
    item("– France", 79, 640),
    item("– Italy", 79, 625),
    item("Depth studies", 57, 580, 16),
    item("Depth study A: The First World War, 1914–18", 62, 560, 13),
    item("1 Why was there stalemate on the Western Front?", 62, 540),
    item("Focus points", 62, 525),
    item("• Why did the Schlieffen Plan fail?", 62, 510),
  ];
  const result = parseSyllabus(items, "history");
  assert.deepEqual(
    result.topics.map((topic) => [topic.topic_code, topic.name]),
    [
      ["A", "Option A: The nineteenth century"],
      ["DA", "Depth study A: The First World War, 1914–18"],
    ],
  );
  assert.deepEqual(
    objectives(result).map((objective) => [objective.local_code, objective.text]),
    [
      ["A.1.1", "Causes, events and results of revolutions in: France, Italy"],
      ["DA.1.1", "Why did the Schlieffen Plan fail?"],
    ],
  );
});

test("skills layout: each skill heading is a topic and its bullets are outcomes", () => {
  const items = [
    ...heading(750),
    item("Skills", 57, 720, 16),
    item("The skills covered in the syllabus are outlined below.", 57, 705),
    item("Listening", 62, 690),
    item("• Understand short recordings dealing with everyday needs (e.g. simple", 62, 670),
    item("directions).", 79, 657),
    item("Reading", 62, 630),
    item("• Understand short, simple texts.", 62, 610),
    item("Topic areas", 57, 580, 16),
    item("A Everyday activities", 62, 560),
    item("• Time expressions", 62, 545),
  ];
  const result = parseSyllabus(items, "skills");
  assert.deepEqual(
    result.topics.map((topic) => topic.name),
    ["Listening", "Reading"],
  );
  assert.deepEqual(
    objectives(result).map((objective) => objective.text),
    ["Understand short recordings dealing with everyday needs (e.g. simple directions).", "Understand short, simple texts."],
  );
});

test("extracts command words without guessing", () => {
  assert.equal(commandWordOf("Explain how osmosis works"), "Explain");
  assert.equal(commandWordOf("Sketch the graph"), "Sketch");
  assert.equal(commandWordOf("The student should understand"), "");
});

/**
 * The real syllabuses. They are Cambridge's copyright, so they live in the
 * git-ignored raw-syllabuses/ folder and these tests skip on a clone without them.
 * Counts were checked against the PDFs: decimal codes by an independent text
 * search, column layouts by every subtopic numbering 1..N with no gaps, and
 * topic counts against each syllabus's own contents list.
 */
const EXPECTED: Record<string, { topics: number; subtopics: number; objectives: number; core?: number }> = {
  "0455": { topics: 6, subtopics: 36, objectives: 113 },
  "0460": { topics: 10, subtopics: 35, objectives: 129 },
  "0470": { topics: 7, subtopics: 31, objectives: 164 },
  "0478": { topics: 10, subtopics: 24, objectives: 96 },
  "0500": { topics: 3, subtopics: 3, objectives: 18 },
  "0530": { topics: 4, subtopics: 4, objectives: 26 },
  "0580": { topics: 18, subtopics: 125, objectives: 252, core: 97 },
  "0610": { topics: 21, subtopics: 61, objectives: 389, core: 235 },
  "0620": { topics: 12, subtopics: 49, objectives: 252, core: 154 },
  "0625": { topics: 6, subtopics: 58, objectives: 324, core: 197 },
};

for (const [code, expected] of Object.entries(EXPECTED)) {
  const subject = getSubject(code)!;
  const file = path.join(process.cwd(), "raw-syllabuses", subject.pdf_hint);

  test(`${code} ${subject.name}: extracts the full subject content`, { skip: !existsSync(file) && "PDF not present" }, async () => {
    const result = parseSyllabus(await extractItems(readFileSync(file)), subject.content_layout);
    const all = objectives(result);

    assert.deepEqual(result.warnings, []);
    assert.equal(result.topics.length, expected.topics, "topics");
    assert.equal(
      result.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0),
      expected.subtopics,
      "subtopics",
    );
    assert.equal(all.length, expected.objectives, "objectives");
    if (expected.core !== undefined) {
      assert.equal(all.filter((objective) => objective.tier === "Core").length, expected.core, "core objectives");
    }
    assert.ok(all.every((objective) => objective.text.length >= 8), "every objective has real text");
    assert.equal(new Set(all.map((objective) => objective.local_code)).size, all.length, "codes are unique");
  });
}
