/**
 * What the learner's device receives for a sitting. Built field by field from
 * an allow-list so a new column on question_templates can never leak an
 * answer key into the page.
 */
export type SittingQuestion = {
  id: string;
  number: number;
  kind: string;
  prompt: string;
  marks: number;
  options: Array<{ letter: string; text: string }>;
  parts: Array<{ label: string; prompt: string; marks: number }>;
  imagePaths: string[];
};

export function toSittingQuestion(
  row: {
    id: string;
    question_type: string;
    prompt_template: string;
    options_schema: unknown;
    parts: unknown;
    image_paths: string[] | null;
  },
  number: number,
  marks: number,
): SittingQuestion {
  const options = Array.isArray(row.options_schema)
    ? (row.options_schema as Array<{ letter?: unknown; text?: unknown }>).map((option) => ({
        letter: String(option.letter ?? ""),
        text: String(option.text ?? ""),
      }))
    : [];
  const parts = Array.isArray(row.parts)
    ? (row.parts as Array<{ label?: unknown; prompt?: unknown; marks?: unknown }>).map((part) => ({
        label: String(part.label ?? ""),
        prompt: String(part.prompt ?? ""),
        marks: Number(part.marks ?? 0),
      }))
    : [];

  return {
    id: row.id,
    number,
    kind: row.question_type,
    prompt: row.prompt_template,
    marks,
    options,
    parts,
    imagePaths: row.image_paths ?? [],
  };
}

export function secondsLeft(startedAt: string, durationMinutes: number, now: Date = new Date()) {
  const endsAt = Date.parse(startedAt) + durationMinutes * 60_000;
  return Math.max(0, Math.floor((endsAt - now.getTime()) / 1000));
}
