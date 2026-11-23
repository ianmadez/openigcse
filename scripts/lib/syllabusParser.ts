/**
 * Deterministic extraction of Cambridge syllabus structure.
 *
 * The parser never guesses content: it reads positioned text from the PDF and
 * rebuilds the numbered hierarchy the document already contains. Every failure
 * is loud, so a partial extraction cannot be mistaken for a full one.
 */

export type TextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

export type TextLine = {
  page: number;
  y: number;
  x: number;
  text: string;
  items: TextItem[];
};

export type ParsedObjective = {
  local_code: string;
  text: string;
  tier: "Core" | "Extended" | "Both" | "Untiered";
  sequence: number;
};

export type ParsedSubtopic = {
  topic_code: string;
  name: string;
  sequence: number;
  objectives: ParsedObjective[];
};

export type ParsedTopic = {
  topic_code: string;
  name: string;
  sequence: number;
  subtopics: ParsedSubtopic[];
};

export type ParseResult = {
  topics: ParsedTopic[];
  mode: "tiered" | "untiered";
  columns: { core: number | null; extended: number | null };
  warnings: string[];
};

export const COMMAND_WORDS = [
  "Analyse",
  "Annotate",
  "Apply",
  "Calculate",
  "Compare",
  "Complete",
  "Construct",
  "Convert",
  "Define",
  "Derive",
  "Describe",
  "Design",
  "Determine",
  "Discuss",
  "Draw",
  "Estimate",
  "Evaluate",
  "Explain",
  "Give",
  "Identify",
  "Interpret",
  "Justify",
  "Label",
  "Measure",
  "Name",
  "Outline",
  "Plot",
  "Predict",
  "Recognise",
  "Relate",
  "Simplify",
  "Sketch",
  "Solve",
  "State",
  "Structure",
  "Suggest",
  "Summarise",
  "Understand",
  "Use",
  "Vary",
  "Write",
  "Organise",
] as const;

const TOPIC_LINE = /^(\d{1,2})\s+([A-Z][^\n]{2,90})$/;
const TOPIC_NUMBER_ONLY = /^(\d{1,2})$/;
const SUBTOPIC_LINE = /^(\d{1,2}\.\d{1,2})\s+(.+)$/;
/** Bullet glyphs Cambridge uses in content tables, written as escapes. */
const BULLET = /^[\u2022\u25cf\u25cb\u25aa\u25ab\u2013\u2014-]\s*/;
const PAGINATION = /^\d{1,3}$/;
const SECTION_END = /^(scheme of assessment|details of the assessment|appendix|changes to the syllabus)/i;

export function commandWordOf(text: string): string {
  const first = text.trim().split(/[\s,.:;]/)[0] ?? "";
  const match = COMMAND_WORDS.find((word) => word.toLowerCase() === first.toLowerCase());
  return match ?? "";
}

/**
 * Joins items that sit on one visual row. When a column split is supplied,
 * items on opposite sides of it stay separate even when they share a baseline,
 * because Cambridge prints Core and Supplement side by side.
 */
export function groupLines(
  items: TextItem[],
  options: { tolerance?: number; splitX?: number | null } = {},
): TextLine[] {
  const tolerance = options.tolerance ?? 3;
  const splitX = options.splitX ?? null;
  const sideOf = (x: number) => (splitX === null ? 0 : x >= splitX ? 1 : 0);

  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: TextLine[] = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    const sameRow =
      current !== undefined &&
      current.page === item.page &&
      Math.abs(current.y - item.y) <= tolerance &&
      sideOf(current.items[0]!.x) === sideOf(item.x);

    if (sameRow) {
      current.items.push(item);
      current.text = `${current.text} ${item.text}`.replace(/\s+/g, " ").trim();
      current.x = Math.min(current.x, item.x);
    } else {
      lines.push({ page: item.page, y: item.y, x: item.x, text: item.text.trim(), items: [item] });
    }
  }

  return lines;
}

function detectColumns(lines: TextLine[]): { core: number | null; extended: number | null } {
  for (const line of lines) {
    const core = line.items.find((item) => /^core$/i.test(item.text.trim()));
    const extended = line.items.find((item) => /^(supplement|extended)$/i.test(item.text.trim()));
    if (core && extended && extended.x > core.x) {
      return { core: core.x, extended: extended.x };
    }
  }
  return { core: null, extended: null };
}

/**
 * Reads the numbered hierarchy between "Subject content" and the next top-level
 * section. Objectives are the bulleted rows inside a numbered subtopic.
 */
export function parseSubjectContent(items: TextItem[]): ParseResult {
  const warnings: string[] = [];

  // First pass without a column split so the header row keeps both labels.
  const columns = detectColumns(groupLines(items));
  const splitX = columns.extended !== null ? columns.extended - 12 : null;
  const lines = groupLines(items, { splitX });

  const startIndex = lines.findIndex((line) => /^subject content$/i.test(line.text.trim()));
  if (startIndex === -1) {
    throw new Error(
      'Could not find a "Subject content" heading. The file is not a Cambridge syllabus outline, or it needs OCR.',
    );
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (SECTION_END.test(lines[i]!.text.trim())) {
      endIndex = i;
      break;
    }
  }

  const section = lines.slice(startIndex, endIndex);
  const mode: ParseResult["mode"] = splitX !== null ? "tiered" : "untiered";

  if (mode === "untiered") {
    warnings.push("No Core/Supplement column headers found; every objective is recorded as Untiered.");
  }

  const topics: ParsedTopic[] = [];
  let topic: ParsedTopic | null = null;
  let subtopic: ParsedSubtopic | null = null;
  let pendingTopicNumber: string | null = null;

  const tierFor = (x: number): ParsedObjective["tier"] => {
    if (splitX === null) return "Untiered";
    return x >= splitX ? "Extended" : "Core";
  };

  const pushObjective = (text: string, x: number) => {
    if (!subtopic) {
      warnings.push(`Objective before any subtopic was skipped: "${text.slice(0, 60)}"`);
      return;
    }
    const clean = text.replace(BULLET, "").trim();
    if (clean.length < 8 || PAGINATION.test(clean)) return;
    subtopic.objectives.push({
      local_code: `${subtopic.topic_code}.${subtopic.objectives.length + 1}`,
      text: clean,
      tier: tierFor(x),
      sequence: subtopic.objectives.length + 1,
    });
  };

  for (const row of section) {
    const text = row.text;
    if (!text || PAGINATION.test(text)) continue;

    const numberOnly = text.match(TOPIC_NUMBER_ONLY);
    if (numberOnly) {
      pendingTopicNumber = numberOnly[1]!;
      continue;
    }

    if (pendingTopicNumber) {
      const title = text.replace(/^[^\p{L}]+/u, "").trim();
      if (title.length >= 3 && title.length <= 90 && /^[A-Z]/.test(title)) {
        topic = { topic_code: pendingTopicNumber, name: title, sequence: topics.length + 1, subtopics: [] };
        topics.push(topic);
        subtopic = null;
        pendingTopicNumber = null;
        continue;
      }
      pendingTopicNumber = null;
    }

    const topicMatch = text.match(TOPIC_LINE);
    if (topicMatch) {
      topic = { topic_code: topicMatch[1]!, name: topicMatch[2]!.trim(), sequence: topics.length + 1, subtopics: [] };
      topics.push(topic);
      subtopic = null;
      continue;
    }

    const subtopicMatch = text.match(SUBTOPIC_LINE);
    if (subtopicMatch && topic) {
      subtopic = {
        topic_code: subtopicMatch[1]!,
        name: subtopicMatch[2]!.trim(),
        sequence: topic.subtopics.length + 1,
        objectives: [],
      };
      topic.subtopics.push(subtopic);
      continue;
    }

    if (!subtopic) continue;

    if (BULLET.test(text)) {
      pushObjective(text, row.x);
      continue;
    }

    // A wrapped line continues the previous objective when no sentence ended.
    const last = subtopic.objectives[subtopic.objectives.length - 1];
    if (last && text.length > 20 && !/[.:;]$/.test(last.text)) {
      last.text = `${last.text} ${text}`.replace(/\s+/g, " ");
    } else if (text.length > 20) {
      pushObjective(text, row.x);
    }
  }

  const cleaned = topics.filter((item) => item.subtopics.length > 0);
  if (cleaned.length === 0) {
    throw new Error("No topics were found. Check that the PDF has a text layer and uses Cambridge numbering (1, 1.1).");
  }

  const objectiveCount = cleaned.reduce(
    (sum, item) => sum + item.subtopics.reduce((sub, s) => sub + s.objectives.length, 0),
    0,
  );
  if (objectiveCount === 0) {
    warnings.push("Numbered topics were found but no bulleted objectives. Check the layout before publishing.");
  }

  return { topics: cleaned, mode, columns, warnings };
}
