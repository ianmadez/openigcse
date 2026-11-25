import { createServerClientInstance } from "@/lib/supabase/server";
import { triviaModuleRows, type TriviaLetter, type TriviaModuleInput, type TriviaOption } from "@/lib/trivia/module";

export type TriviaQuestion = {
  id: string;
  atSeconds: number;
  prompt: string;
  options: TriviaOption[];
};

export type TriviaModule = {
  id: string;
  title: string;
  /** Free text, set by the household that authored the module. */
  topicArea: string;
  provider: string;
  youtubeVideoId: string;
  description: string;
  durationMinutes: number;
  questions: TriviaQuestion[];
};

export type TriviaEditorQuestion = TriviaQuestion & {
  correctLetter: TriviaLetter;
  explanation: string;
};

export type TriviaEditorModule = Omit<TriviaModule, "questions"> & {
  isPublished: boolean;
  questions: TriviaEditorQuestion[];
};

type QuestionRow = {
  id: string;
  module_id: string;
  at_seconds: number;
  prompt: string;
  options: unknown;
  correct_letter?: string;
  explanation?: string | null;
};

type ModuleRow = {
  id: string;
  title: string;
  topic_area: string;
  provider: string;
  youtube_video_id: string;
  description: string;
  duration_minutes: number | null;
  is_published?: boolean;
};

const LETTERS: TriviaLetter[] = ["A", "B", "C", "D"];

function letterOf(value: string | undefined): TriviaLetter {
  return LETTERS.find((letter) => letter === value) ?? "A";
}

/** Options are stored as JSON: either objects with a letter, or plain strings. */
function normaliseOptions(value: unknown): TriviaOption[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 4).map((option, index) => {
    const letter = LETTERS[index] ?? "A";
    if (typeof option === "string") return { letter, text: option };
    if (option && typeof option === "object" && "text" in option) {
      const record = option as { letter?: string; text?: string };
      return { letter: LETTERS.find((item) => item === record.letter) ?? letter, text: record.text ?? "" };
    }
    return { letter, text: "" };
  });
}

function moduleFields(row: ModuleRow) {
  return {
    id: row.id,
    title: row.title,
    topicArea: row.topic_area,
    provider: row.provider,
    youtubeVideoId: row.youtube_video_id,
    description: row.description,
    durationMinutes: row.duration_minutes ?? 0,
  };
}

/**
 * Published modules for the learner. Questions come from `learner_trivia_questions`, which
 * carries no correct letter and no explanation: answer_trivia_checkpoint() decides both.
 */
export async function getTriviaModules(): Promise<TriviaModule[]> {
  const supabase = await createServerClientInstance();
  const { data: modules } = await supabase
    .from("trivia_modules")
    .select("id, title, topic_area, provider, youtube_video_id, description, duration_minutes")
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  if (!modules?.length) return [];

  const { data: questions } = await supabase
    .from("learner_trivia_questions")
    .select("id, module_id, at_seconds, prompt, options")
    .in(
      "module_id",
      modules.map((module) => module.id),
    )
    .order("at_seconds", { ascending: true });

  return (modules as ModuleRow[]).map((row) => ({
    ...moduleFields(row),
    questions: ((questions ?? []) as QuestionRow[])
      .filter((question) => question.module_id === row.id)
      .map((question) => ({
        id: question.id,
        atSeconds: question.at_seconds,
        prompt: question.prompt,
        options: normaliseOptions(question.options),
      })),
  }));
}

export async function getTriviaModule(id: string): Promise<TriviaModule | null> {
  const modules = await getTriviaModules();
  return modules.find((module) => module.id === id) ?? null;
}

/** Everything the household has authored, published or not, with keys, for `/parent/trivia`. */
export async function getTriviaEditorModules(): Promise<TriviaEditorModule[]> {
  const supabase = await createServerClientInstance();
  const { data: modules } = await supabase
    .from("trivia_modules")
    .select("id, title, topic_area, provider, youtube_video_id, description, duration_minutes, is_published")
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

  return (modules as ModuleRow[]).map((row) => ({
    ...moduleFields(row),
    isPublished: Boolean(row.is_published),
    questions: ((questions ?? []) as QuestionRow[])
      .filter((question) => question.module_id === row.id)
      .map((question) => ({
        id: question.id,
        atSeconds: question.at_seconds,
        prompt: question.prompt,
        options: normaliseOptions(question.options),
        correctLetter: letterOf(question.correct_letter),
        explanation: question.explanation ?? "",
      })),
  }));
}

/**
 * Creates or replaces a module and its checkpoints. The questions are rewritten in one go, so a
 * save leaves exactly what the form showed.
 */
export async function saveTriviaModule(
  householdId: string,
  profileId: string | null,
  input: TriviaModuleInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createServerClientInstance();
  const { module, questions } = triviaModuleRows(input, householdId);
  let moduleId = input.id ?? null;

  if (moduleId) {
    const { data, error } = await supabase.from("trivia_modules").update(module).eq("id", moduleId).select("id");
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: false, error: "That module is not in this household." };

    const { error: clearError } = await supabase.from("trivia_questions").delete().eq("module_id", moduleId);
    if (clearError) return { ok: false, error: clearError.message };
  } else {
    const { data, error } = await supabase
      .from("trivia_modules")
      .insert({ ...module, created_by: profileId })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "The module was not saved." };
    moduleId = data.id as string;
  }

  const { error: questionsError } = await supabase
    .from("trivia_questions")
    .insert(questions.map((question) => ({ ...question, module_id: moduleId })));
  if (questionsError) return { ok: false, error: questionsError.message };

  return { ok: true, id: moduleId };
}

export async function deleteTriviaModule(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.from("trivia_modules").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "That module is not in this household." };
  return { ok: true };
}
