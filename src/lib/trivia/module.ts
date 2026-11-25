import { z } from "zod";

/**
 * What a parent writes on `/parent/trivia`. Pure, so the same rules run in the form, the server
 * action and the tests; the database keeps its own guards for the same values.
 */

export const TRIVIA_LETTERS = ["A", "B", "C", "D"] as const;

export type TriviaLetter = (typeof TRIVIA_LETTERS)[number];

export type TriviaOption = { letter: TriviaLetter; text: string };

const optionSchema = z.object({
  letter: z.enum(TRIVIA_LETTERS),
  text: z.string().trim().min(1, "Every option needs text.").max(300),
});

const checkpointSchema = z
  .object({
    prompt: z.string().trim().min(5, "Write the checkpoint question.").max(500),
    atSeconds: z.number().int().min(0).max(6 * 60 * 60),
    options: z.array(optionSchema).min(2, "Add at least two options.").max(4, "Four options is the most a checkpoint takes."),
    correctLetter: z.enum(TRIVIA_LETTERS),
    explanation: z.string().trim().max(600).default(""),
  })
  .superRefine((value, ctx) => {
    const letters = value.options.map((option) => option.letter);
    if (new Set(letters).size !== letters.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Each option letter can be used once." });
    }
    if (!letters.includes(value.correctLetter)) {
      ctx.addIssue({ code: "custom", path: ["correctLetter"], message: "Mark one of the options as correct." });
    }
  });

export const triviaModuleInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3, "Give the module a title.").max(120),
  /** Free text: a household is not limited to the four areas the old constraint allowed. */
  topicArea: z.string().trim().min(2, "Say which area this belongs to.").max(40),
  provider: z.string().trim().max(80).default(""),
  youtubeVideoId: z.string().trim().regex(/^[\w-]{11}$/, "A YouTube id is 11 characters, like dQw4w9WgXcQ."),
  description: z.string().trim().max(600).default(""),
  durationMinutes: z.number().int().min(0).max(300).nullable().optional(),
  isPublished: z.boolean().default(true),
  checkpoints: z.array(checkpointSchema).min(1, "Add at least one checkpoint.").max(20, "Twenty checkpoints is the most one module takes."),
});

export type TriviaModuleInput = z.infer<typeof triviaModuleInputSchema>;
export type TriviaCheckpointInput = TriviaModuleInput["checkpoints"][number];

export type TriviaModuleRow = {
  household_id: string;
  title: string;
  topic_area: string;
  provider: string;
  youtube_video_id: string;
  description: string;
  duration_minutes: number | null;
  is_published: boolean;
};

export type TriviaQuestionRow = {
  household_id: string;
  at_seconds: number;
  prompt: string;
  options: TriviaOption[];
  correct_letter: TriviaLetter;
  explanation: string;
};

/** The rows a save writes, after validation: one module and its checkpoints in timestamp order. */
export function triviaModuleRows(input: TriviaModuleInput, householdId: string) {
  const module: TriviaModuleRow = {
    household_id: householdId,
    title: input.title,
    topic_area: input.topicArea,
    provider: input.provider,
    youtube_video_id: input.youtubeVideoId,
    description: input.description,
    duration_minutes: input.durationMinutes ?? null,
    is_published: input.isPublished,
  };

  const questions: TriviaQuestionRow[] = [...input.checkpoints]
    .sort((left, right) => left.atSeconds - right.atSeconds)
    .map((checkpoint) => ({
      household_id: householdId,
      at_seconds: checkpoint.atSeconds,
      prompt: checkpoint.prompt,
      options: checkpoint.options.map((option) => ({ letter: option.letter, text: option.text })),
      correct_letter: checkpoint.correctLetter,
      explanation: checkpoint.explanation,
    }));

  return { module, questions };
}

/** The form's starting values when a parent opens a saved module. */
export function triviaInputFromModule(module: {
  title: string;
  topicArea: string;
  provider: string;
  youtubeVideoId: string;
  description: string;
  durationMinutes: number | null;
  isPublished: boolean;
  questions: Array<{
    atSeconds: number;
    prompt: string;
    options: TriviaOption[];
    correctLetter: TriviaLetter;
    explanation: string;
  }>;
}): TriviaModuleInput {
  return {
    title: module.title,
    topicArea: module.topicArea,
    provider: module.provider,
    youtubeVideoId: module.youtubeVideoId,
    description: module.description,
    durationMinutes: module.durationMinutes,
    isPublished: module.isPublished,
    checkpoints: module.questions.map((question) => ({
      atSeconds: question.atSeconds,
      prompt: question.prompt,
      options: question.options,
      correctLetter: question.correctLetter,
      explanation: question.explanation,
    })),
  };
}

/** "2:35" or "155" to seconds. Returns null when the text is not a timestamp. */
export function parseTimestamp(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const plain = /^(\d{1,5})$/.exec(text);
  if (plain) return Number(plain[1]);

  const minutes = /^(\d{1,3}):([0-5]?\d)$/.exec(text);
  if (minutes) return Number(minutes[1]) * 60 + Number(minutes[2]);

  const hours = /^(\d{1,2}):([0-5]?\d):([0-5]?\d)$/.exec(text);
  if (hours) return Number(hours[1]) * 3600 + Number(hours[2]) * 60 + Number(hours[3]);

  return null;
}

export function formatTimestamp(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}
