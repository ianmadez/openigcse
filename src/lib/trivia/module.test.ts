import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTimestamp,
  parseTimestamp,
  triviaInputFromModule,
  triviaModuleInputSchema,
  triviaModuleRows,
} from "./module";

const checkpoint = {
  prompt: "How deep is the abyssal zone?",
  atSeconds: 125,
  options: [
    { letter: "A" as const, text: "200-1000 m" },
    { letter: "B" as const, text: "3000-6000 m" },
  ],
  correctLetter: "B" as const,
  explanation: "Below 3000 m sunlight never reaches.",
};

const valid = {
  title: "The deep ocean",
  topicArea: "Oceanography",
  provider: "BBC Earth",
  youtubeVideoId: "dQw4w9WgXcQ",
  description: "A short film about the abyss.",
  durationMinutes: 12,
  isPublished: true,
  checkpoints: [checkpoint],
};

test("a complete module validates and keeps a free-text topic area", () => {
  const parsed = triviaModuleInputSchema.safeParse(valid);
  assert.equal(parsed.success, true);
  // Register row 6: the four fixed areas are gone, so a household can name its own.
  assert.equal(parsed.success && parsed.data.topicArea, "Oceanography");
});

test("provider and description fall back to empty text", () => {
  const parsed = triviaModuleInputSchema.safeParse({
    title: "Minimal",
    topicArea: "Space",
    youtubeVideoId: "dQw4w9WgXcQ",
    checkpoints: [checkpoint],
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success && [parsed.data.provider, parsed.data.description, parsed.data.isPublished], ["", "", true]);
});

test("a YouTube id must be the eleven characters the database accepts", () => {
  assert.equal(triviaModuleInputSchema.safeParse({ ...valid, youtubeVideoId: "short" }).success, false);
  assert.equal(triviaModuleInputSchema.safeParse({ ...valid, youtubeVideoId: "dQw4w9WgXcQ!" }).success, false);
});

test("the correct letter has to be one of the offered options", () => {
  const result = triviaModuleInputSchema.safeParse({
    ...valid,
    checkpoints: [{ ...checkpoint, correctLetter: "D" }],
  });
  assert.equal(result.success, false);
  assert.match(result.error?.issues[0]?.message ?? "", /Mark one of the options/);
});

test("a module needs at least one checkpoint", () => {
  assert.equal(triviaModuleInputSchema.safeParse({ ...valid, checkpoints: [] }).success, false);
});

test("rows are stamped with the household and ordered by timestamp", () => {
  const input = triviaModuleInputSchema.parse({
    ...valid,
    checkpoints: [
      { ...checkpoint, prompt: "Second question", atSeconds: 300 },
      checkpoint,
    ],
  });

  const rows = triviaModuleRows(input, "household-1");
  assert.equal(rows.module.household_id, "household-1");
  assert.equal(rows.module.topic_area, "Oceanography");
  assert.deepEqual(rows.questions.map((question) => question.at_seconds), [125, 300]);
  assert.deepEqual(rows.questions[0]?.options, checkpoint.options);
  assert.equal(rows.questions[0]?.correct_letter, "B");
});

test("timestamps accept seconds, m:ss and h:mm:ss", () => {
  assert.equal(parseTimestamp("125"), 125);
  assert.equal(parseTimestamp("2:05"), 125);
  assert.equal(parseTimestamp("0:07"), 7);
  assert.equal(parseTimestamp("1:02:03"), 3723);
  assert.equal(parseTimestamp("2:75"), null);
  assert.equal(parseTimestamp("later"), null);
  assert.equal(parseTimestamp(""), null);
});

test("formatTimestamp is the inverse for editing", () => {
  assert.equal(formatTimestamp(125), "2:05");
  assert.equal(formatTimestamp(7), "0:07");
  assert.equal(parseTimestamp(formatTimestamp(3723)), 3723);
});

test("a saved module round-trips into the form's starting values", () => {
  const input = triviaModuleInputSchema.parse(valid);
  const again = triviaInputFromModule({
    ...input,
    durationMinutes: 12,
    questions: input.checkpoints,
  });
  assert.deepEqual(again.checkpoints, input.checkpoints);
  assert.equal(again.title, input.title);
});
