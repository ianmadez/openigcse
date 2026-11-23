import assert from "node:assert/strict";
import test from "node:test";

import { commandWordOf, groupLines, parseSubjectContent, type TextItem } from "./syllabusParser";

const BULLET = "\u2022 ";

function item(text: string, x: number, y: number): TextItem {
  return { text, x, y, width: text.length * 4, height: 10, page: 1 };
}

const tieredItems: TextItem[] = [
  item("Subject content", 60, 700),
  item("Core", 60, 680),
  item("Supplement", 320, 680),
  item("1", 60, 660),
  item("Data representation", 90, 660),
  item("1.1", 60, 640),
  item("Number systems", 90, 640),
  item(`${BULLET}why computers use binary to represent all forms of data`, 60, 620),
  item(`${BULLET}convert between binary, denary and hexadecimal`, 60, 600),
  item(`${BULLET}perform binary addition on 8-bit registers`, 320, 600),
  item("2", 60, 560),
  item("Data transmission", 90, 560),
  item("2.1", 60, 540),
  item("Types and methods of data transmission", 90, 540),
  item(`${BULLET}describe how data is split into packets`, 60, 520),
  item("Scheme of assessment", 60, 480),
  item("Paper 1", 60, 460),
];

test("groups rows that share a baseline", () => {
  const lines = groupLines(tieredItems);
  // Header labels and the topic number share rows with their neighbours.
  assert.equal(lines.length, 11);
  assert.ok(lines.some((line) => line.text === "1 Data representation"));
});

test("splits Core and Supplement cells that share a baseline", () => {
  const split = groupLines(tieredItems, { splitX: 308 });
  assert.ok(split.some((line) => line.text.includes("convert between binary")));
  assert.ok(split.some((line) => line.text.includes("perform binary addition")));
  assert.ok(!split.some((line) => line.text.includes("convert between binary. perform")));
});

test("reads the numbered hierarchy and splits tiers by column", () => {
  const parsed = parseSubjectContent(tieredItems);

  assert.equal(parsed.mode, "tiered");
  assert.equal(parsed.topics.length, 2);
  assert.equal(parsed.topics[0]!.name, "Data representation");
  assert.equal(parsed.topics[0]!.subtopics.length, 1);

  const objectives = parsed.topics[0]!.subtopics[0]!.objectives;
  assert.equal(objectives.length, 3);
  assert.equal(objectives[0]!.tier, "Core");
  assert.equal(objectives[2]!.tier, "Extended");
  assert.equal(objectives[0]!.local_code, "1.1.1");
});

test("stops at the next top-level section", () => {
  const parsed = parseSubjectContent(tieredItems);
  assert.ok(!parsed.topics.some((topic) => topic.name === "Scheme of assessment"));
});

test("falls back to untiered when no columns exist", () => {
  const items: TextItem[] = [
    item("Subject content", 60, 700),
    item("1", 60, 680),
    item("Reading", 90, 680),
    item("1.1", 60, 660),
    item("Explicit meaning", 90, 660),
    item(`${BULLET}identify and retrieve explicit information from a passage`, 60, 640),
  ];
  const parsed = parseSubjectContent(items);
  assert.equal(parsed.mode, "untiered");
  assert.equal(parsed.topics[0]!.subtopics[0]!.objectives[0]!.tier, "Untiered");
});

test("reports a missing section instead of inventing one", () => {
  assert.throws(() => parseSubjectContent([item("Contents", 60, 700)]), /Subject content/);
});

test("extracts command words without guessing", () => {
  assert.equal(commandWordOf("Explain how osmosis works"), "Explain");
  assert.equal(commandWordOf("Sketch the graph"), "Sketch");
  assert.equal(commandWordOf("The student should understand"), "");
});
