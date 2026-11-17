/**
 * What the question editor sends, and the row it becomes. Pure, so the rules
 * that decide whether a question is markable are unit-tested rather than
 * discovered at the marking desk.
 */
import { z } from "zod";

export const QUESTION_KINDS = ["MCQ", "ShortAnswer", "Structured", "CalculationTemplate"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const KIND_LABEL: Record<QuestionKind, string> = {
  MCQ: "Multiple choice",
  ShortAnswer: "Short answer",
  Structured: "Structured",
  CalculationTemplate: "Calculation",
};

export const TIERS = ["Both", "Core", "Extended"] as const;
export const DIFFICULTIES = ["Intro", "Standard", "ExamLevel"] as const;
export const DIFFICULTY_LABEL: Record<(typeof DIFFICULTIES)[number], string> = {
  Intro: "Intro",
  Standard: "Standard",
  ExamLevel: "Exam level",
};

export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export const questionInputSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(QUESTION_KINDS),
  objectiveId: z.string().uuid("Tag the question to a syllabus objective."),
  assessmentObjectiveId: z.string().uuid().nullable(),
  tier: z.enum(TIERS),
  difficulty: z.enum(DIFFICULTIES),
  prompt: z.string().max(5000),
  options: z.array(z.object({ letter: z.enum(OPTION_LETTERS), text: z.string().max(500) })).max(4),
  correctOption: z.enum(OPTION_LETTERS).nullable(),
  parts: z
    .array(z.object({ label: z.string().max(8), prompt: z.string().max(2000), marks: z.number().int().min(1).max(20) }))
    .max(10),
  marks: z.number().int().min(1).max(50),
  modelAnswer: z.string().max(5000),
  markScheme: z.string().max(5000),
  imagePaths: z.array(z.string().max(300)).max(4),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;

export type QuestionRow = {
  household_id: string;
  objective_id: string;
  assessment_objective_id: string | null;
  question_type: QuestionKind;
  tier: string;
  difficulty: string;
  prompt_template: string;
  options_schema: Array<{ letter: string; text: string; correct: boolean }> | null;
  parts: Array<{ label: string; prompt: string; marks: number }>;
  max_marks: number;
  model_answer: string | null;
  mark_scheme_rubric: string;
  image_paths: string[];
};

type Result = { ok: true; row: QuestionRow } | { ok: false; error: string };

export function toQuestionRow(input: QuestionInput, householdId: string): Result {
  const prompt = input.prompt.trim();
  const modelAnswer = input.modelAnswer.trim();
  const markScheme = input.markScheme.trim();

  if (!prompt) return { ok: false, error: "Write the question." };

  const folder = `${householdId}/questions/`;
  if (input.imagePaths.some((path) => !path.startsWith(folder) || path.includes(".."))) {
    return { ok: false, error: "An attached image is not in this household's files." };
  }

  const common = {
    household_id: householdId,
    objective_id: input.objectiveId,
    assessment_objective_id: input.assessmentObjectiveId,
    question_type: input.kind,
    tier: input.tier,
    difficulty: input.difficulty,
    prompt_template: prompt,
    image_paths: input.imagePaths,
  };

  if (input.kind === "MCQ") {
    const options = input.options.map((option) => ({ letter: option.letter, text: option.text.trim() }));
    if (options.length < 2) return { ok: false, error: "A multiple-choice question needs at least two options." };
    if (options.some((option) => !option.text)) return { ok: false, error: "Fill in every option or remove it." };
    if (new Set(options.map((option) => option.letter)).size !== options.length) {
      return { ok: false, error: "Two options share a letter." };
    }
    if (!input.correctOption || !options.some((option) => option.letter === input.correctOption)) {
      return { ok: false, error: "Choose which option is correct." };
    }

    return {
      ok: true,
      row: {
        ...common,
        options_schema: options.map((option) => ({ ...option, correct: option.letter === input.correctOption })),
        parts: [],
        max_marks: input.marks,
        model_answer: input.correctOption,
        mark_scheme_rubric: markScheme || `Correct answer: ${input.correctOption}`,
      },
    };
  }

  if (!markScheme) return { ok: false, error: "Add a marking guide so the marks can be checked." };

  if (input.kind === "Structured") {
    const parts = input.parts.map((part) => ({ ...part, label: part.label.trim(), prompt: part.prompt.trim() }));
    if (parts.length === 0) return { ok: false, error: "A structured question needs at least one part." };
    if (parts.some((part) => !part.prompt)) return { ok: false, error: "Every part needs its question." };

    return {
      ok: true,
      row: {
        ...common,
        options_schema: null,
        parts,
        max_marks: parts.reduce((sum, part) => sum + part.marks, 0),
        model_answer: modelAnswer || null,
        mark_scheme_rubric: markScheme,
      },
    };
  }

  if (!modelAnswer) return { ok: false, error: "Add a model answer to mark against." };

  return {
    ok: true,
    row: {
      ...common,
      options_schema: null,
      parts: [],
      max_marks: input.marks,
      model_answer: modelAnswer,
      mark_scheme_rubric: markScheme,
    },
  };
}
