/**
 * Deterministic extraction of Cambridge syllabus structure.
 *
 * The parser never guesses content: it reads positioned text from the PDF and
 * rebuilds the hierarchy the document already prints. Cambridge lays out each
 * subject family differently, so each family has its own reader over a shared
 * section finder. Every failure is loud, so a partial extraction cannot be
 * mistaken for a full one.
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
  /** Largest font height on the row; headings print larger than body text. */
  height: number;
  /** 0 = left column (or the only column), 1 = right column. */
  side: 0 | 1;
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

/**
 * How a syllabus prints its subject content.
 * - decimal: 1 / 1.1 / 1.1.1 statements with bullets (Economics, Geography)
 * - science: numbered statements in Core and Supplement columns (sciences)
 * - maths:   C1.1 / E1.1 objectives beside a "Notes and examples" column
 * - cs:      numbered statements beside a "Notes and guidance" column
 * - history: options and depth studies, key questions, specified content
 * - skills:  skill headings with bulleted outcomes and no topic tree (languages)
 */
export type ContentLayout = "decimal" | "science" | "maths" | "cs" | "history" | "skills";

export type ParseResult = {
  topics: ParsedTopic[];
  layout: ContentLayout;
  mode: "tiered" | "untiered";
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

/** Bullet glyphs Cambridge uses in content tables, written as escapes. */
const BULLET = /^[•●○▪▫–—-]\s*/;
const DASH = /^[–—-]\s*/;
const TOPIC_SIZE = 12;
const SECTION_SIZE = 14;
/** Running header and footer bands on an A4 Cambridge page. */
const HEADER_Y = 805;
const FOOTER_Y = 30;
/** Left column starts near x=62, right column near x=309 on every two-column page. */
const COLUMN_SPLIT = 300;
const TWO_COLUMN: ReadonlySet<ContentLayout> = new Set(["science", "maths", "cs"]);

export function commandWordOf(text: string): string {
  const first = text.trim().split(/[\s,.:;]/)[0] ?? "";
  const match = COMMAND_WORDS.find((word) => word.toLowerCase() === first.toLowerCase());
  return match ?? "";
}

/**
 * Joins items that sit on one visual row. When a column split is supplied,
 * items on opposite sides of it stay separate even when they share a baseline,
 * because Cambridge prints two columns side by side.
 */
export function groupLines(
  items: TextItem[],
  options: { tolerance?: number; splitX?: number | null } = {},
): TextLine[] {
  const tolerance = options.tolerance ?? 3;
  const splitX = options.splitX ?? null;
  const sideOf = (x: number): 0 | 1 => (splitX !== null && x >= splitX ? 1 : 0);

  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const open: TextLine[] = [];
  const lines: TextLine[] = [];

  for (const item of sorted) {
    const side = sideOf(item.x);
    const current = open[side];
    const sameRow = current !== undefined && current.page === item.page && Math.abs(current.y - item.y) <= tolerance;

    if (sameRow) {
      current.items.push(item);
      current.items.sort((a, b) => a.x - b.x);
      current.text = current.items
        .map((part) => part.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      current.x = Math.min(current.x, item.x);
      current.height = Math.max(current.height, item.height);
    } else {
      const line: TextLine = {
        page: item.page,
        y: item.y,
        x: item.x,
        text: item.text.replace(/\s+/g, " ").trim(),
        items: [item],
        height: item.height,
        side,
      };
      open[side] = line;
      lines.push(line);
    }
  }

  return lines.filter((line) => line.text.length > 0);
}

/**
 * The rows of section "N Subject content", without running headers and footers.
 * The section ends at the next numbered section heading.
 */
export function subjectContentLines(items: TextItem[], twoColumn: boolean): TextLine[] {
  const body = items.filter((item) => item.y < HEADER_Y && item.y > FOOTER_Y);
  const lines = groupLines(body, { splitX: twoColumn ? COLUMN_SPLIT : null });

  const isSection = (line: TextLine) => line.height >= SECTION_SIZE && /^\d{1,2}\s+\S/.test(line.text);
  const start = lines.findIndex((line) => isSection(line) && /^\d{1,2}\s+subject content$/i.test(line.text));
  if (start === -1) {
    throw new Error(
      'Could not find the "Subject content" section heading. The file is not a Cambridge syllabus, or it needs OCR.',
    );
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (isSection(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/** Collects topics, subtopics and objectives and enforces unique codes. */
class Builder {
  topics: ParsedTopic[] = [];
  warnings: string[] = [];
  topic: ParsedTopic | null = null;
  subtopic: ParsedSubtopic | null = null;

  openTopic(code: string, name: string) {
    const existing = this.topics.find((topic) => topic.topic_code === code);
    if (existing) {
      this.topic = existing;
      return;
    }
    this.topic = { topic_code: code, name: clean(name), sequence: this.topics.length + 1, subtopics: [] };
    this.topics.push(this.topic);
    this.subtopic = null;
  }

  openSubtopic(code: string, name: string) {
    if (!this.topic) {
      this.warnings.push(`Subtopic ${code} appeared before any topic and was skipped.`);
      return;
    }
    const existing = this.topic.subtopics.find((subtopic) => subtopic.topic_code === code);
    if (existing) {
      this.subtopic = existing;
      return;
    }
    this.subtopic = { topic_code: code, name: clean(name), sequence: this.topic.subtopics.length + 1, objectives: [] };
    this.topic.subtopics.push(this.subtopic);
  }

  addObjective(localCode: string, text: string, tier: ParsedObjective["tier"]): ParsedObjective | null {
    if (!this.subtopic) {
      this.warnings.push(`Objective ${localCode} appeared before any subtopic and was skipped.`);
      return null;
    }
    const all = this.topics.flatMap((topic) => topic.subtopics.flatMap((sub) => sub.objectives));
    if (all.some((objective) => objective.local_code === localCode)) {
      this.warnings.push(`Objective ${localCode} appeared twice; the second copy was skipped.`);
      return null;
    }
    const objective = { local_code: localCode, text: clean(text), tier, sequence: this.subtopic.objectives.length + 1 };
    this.subtopic.objectives.push(objective);
    return objective;
  }
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\bfi /g, "fi")
    .replace(/\bfl /g, "fl")
    .replace(/ fi\b/g, "fi")
    .replace(/ fl\b/g, "fl")
    .trim();
}

/** Appends a wrapped or bulleted row to an objective's text. */
function append(objective: ParsedObjective, row: string, firstBullet: boolean) {
  if (BULLET.test(row)) {
    const body = row.replace(BULLET, "");
    if (!firstBullet) objective.text = objective.text.replace(/\.$/, "");
    const separator = /[:]$/.test(objective.text) ? " " : firstBullet ? ": " : "; ";
    objective.text = `${objective.text}${separator}${body}`;
  } else {
    objective.text = `${objective.text} ${row}`;
  }
}

const isHeading = (line: TextLine) => line.height >= TOPIC_SIZE;
const CONTINUED = /\s+continued$/i;

function parseDecimal(lines: TextLine[], b: Builder) {
  let objective: ParsedObjective | null = null;
  let bullets = 0;
  for (const line of lines) {
    const text = line.text;
    const topic = isHeading(line) ? text.match(/^(\d{1,2})\s+(.+)$/) : null;
    if (topic) {
      b.openTopic(topic[1]!, topic[2]!.replace(CONTINUED, ""));
      objective = null;
      continue;
    }
    const third = text.match(/^(\d{1,2}\.\d{1,2}\.\d{1,2})\s+(.+)$/);
    if (third) {
      objective = b.addObjective(third[1]!, third[2]!, "Untiered");
      bullets = 0;
      continue;
    }
    const second = text.match(/^(\d{1,2}\.\d{1,2})\s+(.+)$/);
    if (second) {
      b.openSubtopic(second[1]!, second[2]!.replace(CONTINUED, ""));
      objective = null;
      continue;
    }
    if (objective && line.x > 70) {
      // A wrapped subtopic title sits at the same indent as objective text; only
      // rows after the objective heading belong to it.
      append(objective, text, BULLET.test(text) && bullets === 0);
      if (BULLET.test(text)) bullets += 1;
    } else if (!objective && b.subtopic && line.x > 70 && b.subtopic.objectives.length === 0) {
      b.subtopic.name = clean(`${b.subtopic.name} ${text}`);
    }
  }
}

/** Shared reader for layouts whose statements sit inside one of two columns. */
function parseColumns(
  lines: TextLine[],
  b: Builder,
  options: {
    subtopic: RegExp;
    topic: RegExp;
    roleOf: (line: TextLine, roles: Array<"objective" | "notes" | null>) => Array<"objective" | "notes" | null> | null;
    tierOf: (side: 0 | 1) => ParsedObjective["tier"];
    /** Unnumbered text opens one objective for the subtopic (maths prints some objectives without numbers). */
    unnumbered?: boolean;
    onHeading?: (line: TextLine) => boolean;
  },
) {
  let roles: Array<"objective" | "notes" | null> = ["objective", "objective"];
  const current: Array<ParsedObjective | null> = [null, null];
  const bullets: [number, number] = [0, 0];
  const stems = new Set<ParsedObjective>();
  const listing: [boolean, boolean] = [false, false];

  for (const line of lines) {
    const text = line.text;
    if (options.onHeading?.(line)) {
      current[0] = current[1] = null;
      continue;
    }
    const nextRoles = options.roleOf(line, roles);
    if (nextRoles) {
      roles = nextRoles;
      continue;
    }
    if (/^(extended|supplement) content only\.?$/i.test(text) || /^continued$/i.test(text)) continue;
    if (line.side === 0) {
      const topic = isHeading(line) ? text.match(options.topic) : null;
      if (topic) {
        b.openTopic(topic[1]!, topic[2]!.replace(CONTINUED, ""));
        current[0] = current[1] = null;
        continue;
      }
      const subtopic = line.x < 70 ? text.match(options.subtopic) : null;
      if (subtopic) {
        const code = subtopic[1]!;
        const name = subtopic[2]!.replace(CONTINUED, "").replace(/^(extended|supplement) content only\.?$/i, "");
        const sameAsOpen = b.subtopic?.topic_code === code;
        b.openSubtopic(code, name || code);
        if (!sameAsOpen) current[0] = current[1] = null;
        continue;
      }
    }
    const side = line.side;
    const base = side === 0 ? 62 : 309;
    const statement = text.match(/^(\d{1,2})\s+(\S.*)$/);
    if (roles[side] === "objective" && statement && line.x < base + 8 && b.topic && !b.topic.subtopics.includes(b.subtopic!)) {
      // Some topics print statements with no subtopic level; they get an implicit "N.0" subtopic.
      b.openSubtopic(`${b.topic.topic_code}.0`, b.topic.name);
      current[0] = current[1] = null;
    }
    const subtopic = b.subtopic;
    if (roles[side] !== "objective" || !subtopic) continue;
    const stem = current[side];
    if (statement && stem && stems.has(stem) && (listing[side] || /:$/.test(stem.text))) {
      // An unnumbered stem ending in a colon owns the numbered list under it.
      stem.text = listing[side] ? `${stem.text.replace(/\.$/, "")}; ${statement[2]}` : `${stem.text} ${statement[2]}`;
      listing[side] = true;
      continue;
    }
    if (statement && line.x < base + 8) {
      const owner = subtopic.topic_code.replace(/\.0$/, "");
      current[side] = b.addObjective(`${owner}.${statement[1]}`, statement[2]!, options.tierOf(side));
      bullets[side] = 0;
      continue;
    }
    const objective = current[side];
    if (objective) {
      append(objective, text, BULLET.test(text) && bullets[side] === 0);
      if (BULLET.test(text)) bullets[side] += 1;
    } else if (options.unnumbered && subtopic.objectives.length === 0 && line.x < base + 8 && text.length >= 8) {
      const created = b.addObjective(`${subtopic.topic_code}.1`, text.replace(BULLET, ""), options.tierOf(side));
      current[side] = created;
      bullets[side] = BULLET.test(text) ? 1 : 0;
      if (created) stems.add(created);
      listing[side] = false;
    }
  }
}

function parseScience(lines: TextLine[], b: Builder) {
  parseColumns(lines, b, {
    topic: /^(\d{1,2})\s+(.+)$/,
    subtopic: /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s+(.+)$/,
    roleOf: (line) => (/^(core|supplement)$/i.test(line.text) ? ["objective", "objective"] : null),
    tierOf: (side) => (side === 0 ? "Core" : "Extended"),
  });
}

function parseComputerScience(lines: TextLine[], b: Builder) {
  parseColumns(lines, b, {
    topic: /^(\d{1,2})\s+(.+)$/,
    subtopic: /^(\d{1,2}\.\d{1,2})\s+(.+)$/,
    roleOf: (line, roles) => {
      const next = [...roles];
      if (/^candidates should be able to:?$/i.test(line.text)) next[line.side] = "objective";
      else if (/^notes and guidance$/i.test(line.text)) next[line.side] = "notes";
      else return null;
      return next;
    },
    tierOf: () => "Untiered",
  });
}

function parseHistory(lines: TextLine[], b: Builder) {
  let topicCode = "";
  let mode: "focus" | "content" | null = null;
  let objective: ParsedObjective | null = null;
  let pendingName: string | null = null;
  const focus = new Map<ParsedSubtopic, string[]>();

  for (const line of lines) {
    const text = line.text;
    const option = text.match(/^Core content: Option ([A-Z])$/);
    if (option && isHeading(line)) {
      topicCode = option[1]!;
      pendingName = `Option ${topicCode}`;
      mode = null;
      continue;
    }
    if (pendingName) {
      // The option's title is the next printed line.
      b.openTopic(topicCode, `${pendingName}: ${text}`);
      pendingName = null;
      continue;
    }
    const depth = text.match(/^Depth study ([A-Z]):\s*(.+)$/);
    if (depth && isHeading(line)) {
      topicCode = `D${depth[1]}`;
      b.openTopic(topicCode, `Depth study ${depth[1]}: ${depth[2]}`);
      mode = null;
      continue;
    }
    const question = text.match(/^(\d{1,2})\s+(.+)$/);
    if (question && line.x >= 60 && line.x < 70 && topicCode) {
      b.openSubtopic(`${topicCode}.${question[1]}`, question[2]!);
      mode = null;
      objective = null;
      continue;
    }
    if (/^focus points$/i.test(text)) {
      mode = "focus";
      continue;
    }
    if (/^specified content$/i.test(text)) {
      mode = "content";
      objective = null;
      continue;
    }
    if (mode === "focus" && b.subtopic && BULLET.test(text)) {
      const list = focus.get(b.subtopic) ?? [];
      list.push(text.replace(BULLET, ""));
      focus.set(b.subtopic, list);
      continue;
    }
    if (mode === "focus" && b.subtopic && line.x > 70) {
      const list = focus.get(b.subtopic);
      if (list?.length) list[list.length - 1] = `${list[list.length - 1]} ${text}`;
      continue;
    }
    if (mode !== "content" || !b.subtopic) continue;
    if (DASH.test(text) && objective) {
      objective.text = `${objective.text}${/:$/.test(objective.text) ? " " : ", "}${text.replace(DASH, "")}`;
    } else if (BULLET.test(text)) {
      objective = b.addObjective(
        `${b.subtopic.topic_code}.${b.subtopic.objectives.length + 1}`,
        text.replace(BULLET, ""),
        "Untiered",
      );
    } else if (objective && line.x > 70) {
      objective.text = `${objective.text} ${text}`;
    }
  }
  // Depth studies print focus points only; they are the objectives where no specified content exists.
  for (const [subtopic, points] of focus) {
    if (subtopic.objectives.length > 0) continue;
    for (const point of points) {
      subtopic.objectives.push({
        local_code: `${subtopic.topic_code}.${subtopic.objectives.length + 1}`,
        text: clean(point),
        tier: "Untiered",
        sequence: subtopic.objectives.length + 1,
      });
    }
  }
}

function parseSkills(lines: TextLine[], b: Builder) {
  let objective: ParsedObjective | null = null;
  for (const [index, line] of lines.entries()) {
    const text = line.text;
    const next = lines[index + 1];
    const headingLike =
      isHeading(line) || (next !== undefined && BULLET.test(next.text) && text.length <= 40 && !/[.:,;]$/.test(text));
    // Topic areas are vocabulary contexts rather than outcomes; they end the skills list.
    if (isHeading(line) && /^topic areas$/i.test(text)) break;
    if (headingLike && !BULLET.test(text) && text.length <= 40 && !/^skills$/i.test(text)) {
      const code = String(b.topics.length + 1);
      b.openTopic(code, text);
      b.openSubtopic(`${code}.1`, text);
      objective = null;
      continue;
    }
    if (!b.subtopic) continue;
    if (BULLET.test(text)) {
      objective = b.addObjective(
        `${b.subtopic.topic_code}.${b.subtopic.objectives.length + 1}`,
        text.replace(BULLET, ""),
        "Untiered",
      );
    } else if (objective && line.x > 70) {
      objective.text = `${objective.text} ${text}`;
    } else {
      objective = null;
    }
  }
}

/** Reads the subject content section with the reader for its layout family. */
export function parseSyllabus(items: TextItem[], layout: ContentLayout): ParseResult {
  const lines = subjectContentLines(items, TWO_COLUMN.has(layout));
  const b = new Builder();

  if (layout === "decimal") parseDecimal(lines, b);
  else if (layout === "science") parseScience(lines, b);
  else if (layout === "cs") parseComputerScience(lines, b);
  else if (layout === "maths") parseMathsWithPrefix(lines, b);
  else if (layout === "history") parseHistory(lines, b);
  else parseSkills(lines, b);

  for (const topic of b.topics) {
    topic.subtopics = topic.subtopics
      .filter((sub) => sub.objectives.length > 0 || !topic.subtopics.some((o) => o.topic_code.startsWith(`${sub.topic_code}.`)))
      .filter((sub) => sub.objectives.length > 0 || sub.name !== sub.topic_code)
      .map((sub, index) => ({ ...sub, sequence: index + 1 }));
  }
  const topics = b.topics
    .filter((topic) => topic.subtopics.some((sub) => sub.objectives.length > 0))
    .map((topic, index) => ({ ...topic, sequence: index + 1 }));
  if (topics.length === 0) {
    throw new Error(`No topics with objectives were found using the ${layout} layout. Check the layout family.`);
  }
  for (const topic of topics) {
    for (const sub of topic.subtopics) {
      if (sub.objectives.length === 0) b.warnings.push(`Subtopic ${sub.topic_code} has no objectives.`);
    }
  }
  const tiers = new Set(topics.flatMap((topic) => topic.subtopics.flatMap((sub) => sub.objectives.map((o) => o.tier))));
  return {
    topics,
    layout,
    mode: tiers.has("Core") || tiers.has("Extended") ? "tiered" : "untiered",
    warnings: b.warnings,
  };
}

/** Maths reuses topic numbers in its Core and Extended halves, so topic codes take a C or E prefix. */
function parseMathsWithPrefix(lines: TextLine[], b: Builder) {
  let prefix = "C";
  const tagged = lines.map((line) => {
    const tier = line.text.match(/^(core|extended) subject content$/i);
    if (tier) prefix = tier[1]!.toLowerCase() === "core" ? "C" : "E";
    const topic = line.height >= TOPIC_SIZE ? line.text.match(/^(\d{1,2})\s+(.+)$/) : null;
    return topic ? { ...line, text: `${prefix}${topic[1]} ${topic[2]}` } : line;
  });
  parseColumns(tagged, b, {
    topic: /^([CE]\d{1,2})\s+(.+)$/,
    subtopic: /^([CE]\d{1,2}\.\d{1,2})\s+(.+)$/,
    roleOf: (line) => (/^notes and examples$/i.test(line.text) ? ["objective", "notes"] : null),
    tierOf: () => (b.topic?.topic_code.startsWith("E") ? "Extended" : "Core"),
    unnumbered: true,
    onHeading: (line) => /^(core|extended) subject content$/i.test(line.text),
  });
}
