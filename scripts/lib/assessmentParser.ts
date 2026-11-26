/**
 * The assessment side of a Cambridge syllabus: papers from "Assessment overview",
 * entry routes built from them, assessment objectives with their weightings,
 * and the command-word glossary. Like the content parser it only copies what
 * the PDF prints and reports what it cannot find.
 */
import { groupLines, type TextItem, type TextLine } from "./syllabusParser";

export type Tier = "Core" | "Extended" | "Both" | "Untiered";

export type ParsedComponent = {
  component_code: string;
  name: string;
  duration_minutes: number | null;
  marks: number | null;
  weighting_percent: number | null;
  tier: Tier;
  internally_assessed: boolean;
  /** Printed as optional and graded on its own scale (e.g. 0500 Component 4). */
  separately_endorsed: boolean;
  private_candidate_eligible: boolean;
  note: string;
};

export type ParsedEntryRoute = {
  route_code: string;
  name: string;
  tier: Tier;
  private_candidate_eligible: boolean;
  component_codes: string[];
};

export type ParsedAssessmentObjective = {
  code: string;
  name: string;
  description: string;
  weighting_percent: number | null;
};

export type ParsedCommandWord = { word: string; meaning: string };

const HEADER_Y = 805;
const FOOTER_Y = 30;
const SECTION_SIZE = 14;
const BULLET = /^[•●–—-]\s*/;

function bodyLines(items: TextItem[], splitX: number | null): TextLine[] {
  return groupLines(
    items.filter((item) => item.y < HEADER_Y && item.y > FOOTER_Y),
    { splitX },
  );
}

/** Rows between a 16pt heading and the next heading of at least that size. */
function sectionAfter(lines: TextLine[], heading: RegExp, from = 0): TextLine[] {
  const start = lines.findIndex((line, index) => index >= from && line.height >= SECTION_SIZE && heading.test(line.text));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && line.height >= SECTION_SIZE);
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

/** "1 hour 15 minutes", "Approximately 50 minutes", "Approx. 10–12 minutes" → minutes (upper bound of a range). */
export function minutesOf(text: string): number | null {
  const match = text.match(
    /^(?:approx(?:imately|\.)?\s*)?(?:(\d+)\s*hours?)?\s*(?:(?:\d+\s*[–-]\s*)?(\d+)\s*minutes)?/i,
  );
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

const CARD_START = /^(Paper|Component)\s+(\d{1,2})\b:?\s*(.*)$/;
const DURATION = /^(?:approx(?:imately|\.)?\s*)?(?:\d+\s*hours?|(?:\d+\s*[–-]\s*)?\d+\s*minutes)/i;

/**
 * Reads the component cards. Cambridge prints each paper as a card in a
 * two-column grid, in one of two formats:
 *   "Paper 1: Multiple Choice (Core)" / "45 minutes" / "40 marks 30%"
 *   "Paper 1 2 hours" / "Reading 50%" / "80 marks"
 */
export function parseComponents(items: TextItem[]): { components: ParsedComponent[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = sectionAfter(bodyLines(items, 300), /^assessment overview$/i);
  if (lines.length === 0) return { components: [], warnings: ['No "Assessment overview" section was found.'] };

  const components: ParsedComponent[] = [];
  const open: Array<ParsedComponent | null> = [null, null];
  let sectionTier: Tier | null = null;

  for (const line of lines) {
    const text = line.text;
    if (line.side === 0 && line.x < 60) {
      // Full-width prose and the "Core assessment" / "Extended assessment" headings.
      if (/^core assessment$/i.test(text)) sectionTier = "Core";
      else if (/^extended assessment$/i.test(text)) sectionTier = "Extended";
      else if (/^(practical|coursework|speaking).* assessment$/i.test(text)) sectionTier = null;
      open[0] = open[1] = null;
      continue;
    }

    const start = text.match(CARD_START);
    if (start && line.x < (line.side === 0 ? 70 : 330)) {
      const code = start[2]!;
      let rest = start[3]!.trim();
      let duration: number | null = null;
      if (DURATION.test(rest)) {
        duration = minutesOf(rest);
        rest = "";
      }
      const tierInName = rest.match(/\((Core|Extended)\)\s*$/);
      const component: ParsedComponent = {
        component_code: code,
        name: rest ? `${start[1]} ${code}: ${rest}` : `${start[1]} ${code}`,
        duration_minutes: duration,
        marks: null,
        weighting_percent: null,
        tier: (tierInName?.[1] as Tier | undefined) ?? sectionTier ?? "Both",
        internally_assessed: false,
        separately_endorsed: false,
        private_candidate_eligible: true,
        note: "",
      };
      if (components.some((existing) => existing.component_code === code)) {
        warnings.push(`Component ${code} appeared twice; the second card was skipped.`);
        open[line.side] = null;
        continue;
      }
      components.push(component);
      open[line.side] = component;
      continue;
    }

    const card = open[line.side];
    if (!card) continue;

    if (card.duration_minutes === null && DURATION.test(text)) {
      card.duration_minutes = minutesOf(text);
      continue;
    }
    const marksAndWeight = text.match(/^(\d+)\s+marks(?:\s+(\d+)%)?(?:\s+(separately endorsed))?$/i);
    if (marksAndWeight) {
      card.marks = Number(marksAndWeight[1]);
      if (marksAndWeight[2]) card.weighting_percent = Number(marksAndWeight[2]);
      if (marksAndWeight[3]) card.separately_endorsed = true;
      continue;
    }
    // New-format title row: "Reading 50%".
    const titled = text.match(/^(.{3,80}?)\s+(\d+)%$/);
    if (titled && card.weighting_percent === null && card.name === `${card.name.split(":")[0]}`) {
      card.name = `${card.name}: ${titled[1]}`;
      card.weighting_percent = Number(titled[2]);
      continue;
    }
    if (card.name === card.name.split(":")[0] && /^[A-Z][\w ,'’()-]{2,60}$/.test(text) && !BULLET.test(text)) {
      // A title without a weighting, e.g. "Individual Talk and Conversation".
      card.name = `${card.name}: ${text}`;
      continue;
    }
    if (/^internally assessed/i.test(text) || /^coursework/i.test(text)) card.internally_assessed = true;
    if (/separately endorsed/i.test(text)) card.separately_endorsed = true;
  }

  for (const component of components) {
    const coursework = /(?<!alternative to )(coursework|portfolio)/i.test(component.name);
    if (coursework) component.internally_assessed = true;
    // Private candidates cannot submit school-authenticated coursework or sit a centre-run practical test.
    // Speaking tests are conducted at the exam centre, which a private candidate can attend.
    if (component.internally_assessed && /speaking/i.test(component.name)) {
      component.note = "Conducted and marked at the exam centre, then moderated by Cambridge.";
    } else if (component.internally_assessed) {
      component.private_candidate_eligible = false;
      component.note = "Internally assessed by a school; not available to private candidates.";
    } else if (/practical test/i.test(component.name)) {
      component.private_candidate_eligible = false;
      component.note = "Practical test run by a school; private candidates take the alternative to practical.";
    } else if (component.separately_endorsed) {
      component.note = "Optional and separately endorsed; does not count towards the grade.";
    }
    if (component.duration_minutes === null && !coursework) warnings.push(`Component ${component.component_code} has no duration.`);
    if (component.marks === null) warnings.push(`Component ${component.component_code} has no marks.`);
  }
  if (components.length === 0) warnings.push("No component cards were found in the assessment overview.");
  return { components, warnings };
}

/**
 * Private candidate entry routes. Tiered syllabuses get one route per tier; each
 * route takes the papers for its tier plus untiered ones the candidate can sit,
 * and leaves out optional separately endorsed components. The Extended (or only)
 * route keeps the code "PRIVATE" so existing enrolments stay attached.
 */
export function buildEntryRoutes(components: ParsedComponent[], tiers: Tier[]): ParsedEntryRoute[] {
  const sittable = components.filter((c) => c.private_candidate_eligible && !c.separately_endorsed);
  const tiered = tiers.includes("Core") && tiers.includes("Extended") && components.some((c) => c.tier === "Core");

  const route = (code: string, name: string, tier: Tier, papers: ParsedComponent[]): ParsedEntryRoute | null => {
    const total = papers.reduce((sum, paper) => sum + (paper.weighting_percent ?? 0), 0);
    if (papers.length === 0 || total !== 100) return null;
    return {
      route_code: code,
      name,
      tier,
      private_candidate_eligible: true,
      component_codes: papers.map((paper) => paper.component_code),
    };
  };

  if (!tiered) {
    const only = route("PRIVATE", "Private candidate route", tiers.length === 1 ? tiers[0]! : "Untiered", sittable);
    return only ? [only] : [];
  }
  const forTier = (tier: "Core" | "Extended") => sittable.filter((c) => c.tier === tier || c.tier === "Both");
  return [
    route("PRIVATE-CORE", "Private candidate route (Core)", "Core", forTier("Core")),
    route("PRIVATE", "Private candidate route (Extended)", "Extended", forTier("Extended")),
  ].filter((value): value is ParsedEntryRoute => value !== null);
}

/** "AO1 Name" headings with their description, and the first (whole-qualification) weighting table. */
export function parseAssessmentObjectives(items: TextItem[]): ParsedAssessmentObjective[] {
  const lines = bodyLines(items, null);
  const section = sectionAfter(lines, /^assessment objectives$/i);
  const weightingAt = section.findIndex((line) => /^weighting for assessment objectives$/i.test(line.text));
  const prose = weightingAt === -1 ? section : section.slice(0, weightingAt);
  const table = weightingAt === -1 ? [] : section.slice(weightingAt + 1, weightingAt + 16);

  const objectives: ParsedAssessmentObjective[] = [];
  let current: ParsedAssessmentObjective | null = null;
  for (const line of prose) {
    const heading = line.x < 60 ? line.text.match(/^(AO\d)(?:\s+(.+))?$/) : null;
    if (heading) {
      current = { code: heading[1]!, name: heading[2]?.trim() ?? "", description: "", weighting_percent: null };
      if (!objectives.some((objective) => objective.code === current!.code)) objectives.push(current);
      continue;
    }
    if (!current) continue;
    const text = line.text.replace(BULLET, "");
    current.description = !current.description
      ? text
      : BULLET.test(line.text)
        ? `${current.description.replace(/\.$/, "")}${/:$/.test(current.description) ? " " : "; "}${text}`
        : `${current.description} ${text}`;
  }

  // The first table is the whole qualification; later tables split weightings by component.
  for (const objective of objectives) {
    const row = table.find((line) => line.text.startsWith(`${objective.code} `) || line.text === objective.code);
    const match = row?.text.match(/^AO\d\s+(.*?)\s*(\d{1,3})?(?:\s+\d{1,3})*$/);
    const range = row?.text.match(/(\d{1,3}\s*[–-]\s*\d{1,3})$/);
    if (range) {
      // A printed range does not fit one number; keep the PDF's own words instead.
      objective.weighting_percent = null;
      objective.description = `${objective.description} (Weighting ${range[1]}% of the qualification.)`;
      if (!objective.name) objective.name = row!.text.replace(/^AO\d\s+/, "").replace(range[1]!, "").trim();
    } else if (match) {
      objective.weighting_percent = match[2] ? Number(match[2]) : null;
      if (!objective.name && match[1]) objective.name = match[1].trim();
    }
    if (!objective.name) {
      const sentence = objective.description.split(/[.:]/)[0]!;
      objective.name = sentence.length <= 80 ? sentence : `${sentence.slice(0, 80).replace(/\s+\S*$/, "")}…`;
    }
  }
  return objectives.map((objective) => ({ ...objective, description: objective.description.replace(/\s+/g, " ").trim() }));
}

/** The "Command words" glossary table: the word in the first cell, its meaning in the second. */
export function parseCommandWords(items: TextItem[]): ParsedCommandWord[] {
  const lines = bodyLines(items, null);
  // The glossary sits near the end; take the last "Command words" section.
  let from = -1;
  lines.forEach((line, index) => {
    if (line.height >= SECTION_SIZE && /^command words$/i.test(line.text)) from = index;
  });
  if (from === -1) return [];
  const section = sectionAfter(lines, /^command words$/i, from);
  const words: ParsedCommandWord[] = [];
  let tableX: number | null = null;

  for (const line of section) {
    const [first, ...rest] = line.items;
    if (!first) continue;
    if (/^command word$/i.test(first.text.trim())) {
      tableX = rest[0]?.x ?? null;
      continue;
    }
    if (tableX === null) continue;
    if (first.x < tableX - 10 && rest.length > 0) {
      words.push({
        word: first.text.trim(),
        meaning: rest
          .map((part) => part.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      });
    } else if (first.x >= tableX - 10 && words.length > 0) {
      const last = words[words.length - 1]!;
      last.meaning = `${last.meaning} ${line.text}`.replace(/\s+/g, " ").trim();
    }
  }
  return words;
}
