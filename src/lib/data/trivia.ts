import { createServerClientInstance } from "@/lib/supabase/server";

export type TriviaQuestion = {
  id: string;
  atSeconds: number;
  prompt: string;
  options: Array<{ letter: "A" | "B" | "C" | "D"; text: string }>;
  correctLetter: "A" | "B" | "C" | "D";
  explanation: string;
};

export type TriviaModule = {
  id: string;
  title: string;
  topicArea: "Science" | "History" | "Engineering" | "Nature";
  provider: string;
  youtubeVideoId: string;
  description: string;
  durationMinutes: number;
  questions: TriviaQuestion[];
};

type QuestionRow = {
  id: string;
  module_id: string;
  at_seconds: number;
  prompt: string;
  options: unknown;
  correct_letter: string;
  explanation: string | null;
};

type ModuleRow = {
  id: string;
  title: string;
  topic_area: TriviaModule["topicArea"];
  provider: string;
  youtube_video_id: string;
  description: string;
  duration_minutes: number | null;
};

const LETTERS = ["A", "B", "C", "D"] as const;

/** Options are stored as JSON: either objects with a letter, or plain strings. */
function normaliseOptions(value: unknown): TriviaQuestion["options"] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 4).map((option, index) => {
    const letter = LETTERS[index] ?? "A";
    if (typeof option === "string") return { letter, text: option };
    if (option && typeof option === "object" && "text" in option) {
      const record = option as { letter?: string; text?: string };
      return { letter: (record.letter as (typeof LETTERS)[number]) ?? letter, text: record.text ?? "" };
    }
    return { letter, text: "" };
  });
}

function toQuestion(row: QuestionRow): TriviaQuestion {
  return {
    id: row.id,
    atSeconds: row.at_seconds,
    prompt: row.prompt,
    options: normaliseOptions(row.options),
    correctLetter: (LETTERS.find((letter) => letter === row.correct_letter) ??
      "A") as TriviaQuestion["correctLetter"],
    explanation: row.explanation ?? "",
  };
}

function toModule(row: ModuleRow, questions: QuestionRow[]): TriviaModule {
  return {
    id: row.id,
    title: row.title,
    topicArea: row.topic_area,
    provider: row.provider,
    youtubeVideoId: row.youtube_video_id,
    description: row.description,
    durationMinutes: row.duration_minutes ?? 0,
    questions: questions.filter((question) => question.module_id === row.id).map(toQuestion),
  };
}

/** Published modules for the student, read straight from the trivia tables. */
export async function getTriviaModules(): Promise<TriviaModule[]> {
  const supabase = await createServerClientInstance();
  const { data: modules } = await supabase
    .from("trivia_modules")
    .select("id, title, topic_area, provider, youtube_video_id, description, duration_minutes")
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  if (!modules?.length) return [];

  const { data: questions } = await supabase
    .from("trivia_questions")
    .select("id, module_id, at_seconds, prompt, options, correct_letter, explanation")
    .in(
      "module_id",
      modules.map((module) => module.id),
    )
    .order("at_seconds", { ascending: true });

  return (modules as ModuleRow[]).map((module) => toModule(module, (questions ?? []) as QuestionRow[]));
}

export async function getTriviaModule(id: string): Promise<TriviaModule | null> {
  const modules = await getTriviaModules();
  return modules.find((module) => module.id === id) ?? null;
}
