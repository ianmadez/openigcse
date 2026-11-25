import { unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type ErrorTag =
  "ConceptGap" | "CommandWordMisread" | "CalculationSlip" | "IncompleteExplanation" | "TimePressure";

export type Mistake = {
  id: string;
  objectiveCode: string;
  subjectCode: string;
  errorTag: ErrorTag;
  note: string;
  status: "open" | "resolved";
  createdAt: string;
  /** The stored question to retry, read key-free from learner_questions. */
  question: { type: string; prompt: string; options: Array<{ letter: string; text: string }> } | null;
  correctionSubmitted: boolean;
  /** What the learner wrote for a parent to approve, once submitted. */
  correction: string | null;
  questionSnapshot: string;
  /** Whether a parent logged it at the marking desk or the learner added it from a checkpoint. */
  source: "marking" | "student";
};

type MistakeRow = {
  id: string;
  objective_id: string | null;
  error_category: ErrorTag;
  question_snapshot: string;
  student_reflection: string | null;
  resolved: boolean | null;
  created_at: string;
  question_template_id: string | null;
  correction_submitted_at: string | null;
  source: string | null;
};

type SafeQuestionRow = { id: string; question_type: string; prompt_template: string; options_schema: unknown };

function optionList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) =>
    option && typeof option === "object" && "letter" in option
      ? [{ letter: String((option as { letter: unknown }).letter), text: String((option as { text?: unknown }).text ?? "") }]
      : [],
  );
}

/**
 * The learner's notebook. Mistake rows carry an objective, the objective's topic
 * carries the syllabus version, and the version carries the subject, so the
 * three lookups are folded into one small map instead of a deep embed.
 */
export async function getMistakes(learnerId: string): Promise<Mistake[]> {
  if (!learnerId) return [];

  const supabase = await createServerClientInstance();
  const { data: rows } = await supabase
    .from("mistake_notebook")
    .select("id, objective_id, error_category, question_snapshot, student_reflection, resolved, created_at, question_template_id, correction_submitted_at, source")
    .eq("student_id", learnerId)
    .order("created_at", { ascending: false });

  if (!rows?.length) return [];

  const objectiveIds = unique(
    rows.map((row) => row.objective_id).filter((id): id is string => Boolean(id)),
  );

  const { data: objectives } = objectiveIds.length
    ? await supabase.from("learning_objectives").select("id, objective_code, topic_id").in("id", objectiveIds)
    : { data: [] as { id: string; objective_code: string; topic_id: string }[] };

  const topicIds = unique((objectives ?? []).map((objective) => objective.topic_id));
  const { data: topics } = topicIds.length
    ? await supabase.from("topics").select("id, syllabus_version_id").in("id", topicIds)
    : { data: [] as { id: string; syllabus_version_id: string }[] };

  const versionIds = unique((topics ?? []).map((topic) => topic.syllabus_version_id));
  const { data: versions } = versionIds.length
    ? await supabase.from("syllabus_versions").select("id, subject_id").in("id", versionIds)
    : { data: [] as { id: string; subject_id: string }[] };

  const subjectIds = unique((versions ?? []).map((version) => version.subject_id));
  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, subject_code").in("id", subjectIds)
    : { data: [] as { id: string; subject_code: string }[] };

  const questionIds = unique(
    (rows as MistakeRow[]).map((row) => row.question_template_id).filter((id): id is string => Boolean(id)),
  );
  const { data: questions } = questionIds.length
    ? await supabase.from("learner_questions").select("id, question_type, prompt_template, options_schema").in("id", questionIds)
    : { data: [] as SafeQuestionRow[] };
  const questionById = new Map(((questions ?? []) as SafeQuestionRow[]).map((question) => [question.id, question]));

  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject.subject_code]));
  const versionById = new Map((versions ?? []).map((version) => [version.id, version]));
  const topicById = new Map((topics ?? []).map((topic) => [topic.id, topic]));
  const objectiveById = new Map((objectives ?? []).map((objective) => [objective.id, objective]));

  return (rows as MistakeRow[]).map((row) => {
    const objective = row.objective_id ? objectiveById.get(row.objective_id) : undefined;
    const topic = objective ? topicById.get(objective.topic_id) : undefined;
    const version = topic ? versionById.get(topic.syllabus_version_id) : undefined;
    const subjectCode = version ? (subjectById.get(version.subject_id) ?? "") : "";

    return {
      id: row.id,
      objectiveCode: objective?.objective_code ?? "Unassigned",
      subjectCode,
      errorTag: row.error_category,
      note: row.student_reflection || row.question_snapshot,
      status: row.resolved ? "resolved" : "open",
      createdAt: row.created_at,
      question: (() => {
        const question = row.question_template_id ? questionById.get(row.question_template_id) : undefined;
        return question
          ? { type: question.question_type, prompt: question.prompt_template, options: optionList(question.options_schema) }
          : null;
      })(),
      correctionSubmitted: Boolean(row.correction_submitted_at),
      correction: row.correction_submitted_at ? row.student_reflection : null,
      questionSnapshot: row.question_snapshot,
      source: row.source === "student" ? "student" : "marking",
    };
  });
}

/**
 * Closes a mistake through resolve_mistake(): a correct retry of its question, or a written
 * correction that waits for a parent. The function, not this code, decides what counts.
 */
export async function resolveMistake(mistakeId: string, attempt: { option?: string; correction?: string }) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("resolve_mistake", {
    p_mistake_id: mistakeId,
    p_option: attempt.option ?? null,
    p_correction: attempt.correction ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = (data as Array<{ resolved: boolean; awaiting_parent: boolean; correct_option: string | null }>)?.[0];
  return { ok: true as const, resolved: Boolean(row?.resolved), awaitingParent: Boolean(row?.awaiting_parent) };
}

/** A guardian accepts the learner's written correction. RLS limits this to their household. */
export async function approveCorrection(mistakeId: string) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("mistake_notebook")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", mistakeId)
    .not("correction_submitted_at", "is", null)
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  return data?.length ? { ok: true as const } : { ok: false as const, error: "That correction is not waiting for approval." };
}

/** A guardian changes the reason on a notebook entry; the learner's own pick is only a first guess. */
export async function recategoriseMistake(mistakeId: string, errorTag: ErrorTag) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("mistake_notebook")
    .update({ error_category: errorTag })
    .eq("id", mistakeId)
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  return data?.length ? { ok: true as const } : { ok: false as const, error: "That mistake is not in this household." };
}

function chosenAnswer(options: Array<{ letter: string; text: string }>, option: string) {
  const chosen = options.find((entry) => entry.letter === option);
  return {
    text: chosen?.text ?? "",
    snapshot: `you chose ${option}${chosen?.text ? `: ${chosen.text}` : ""}`,
  };
}

/**
 * "Add to my notebook" from a checkpoint on /today. The row is linked to the question, so it
 * resolves later by a correct retry rather than a written correction.
 */
export async function addCheckpointMistake(
  learnerId: string,
  input: { questionId: string; option: string; errorTag: ErrorTag },
) {
  const supabase = await createServerClientInstance();
  const { data: question } = await supabase
    .from("learner_questions")
    .select("id, objective_id, prompt_template, options_schema")
    .eq("id", input.questionId)
    .maybeSingle();

  if (!question) return { ok: false as const, error: "That checkpoint is not available." };

  const chosen = chosenAnswer(optionList(question.options_schema), input.option);
  const { error } = await supabase.from("mistake_notebook").insert({
    student_id: learnerId,
    objective_id: question.objective_id,
    question_template_id: question.id,
    error_category: input.errorTag,
    question_snapshot: `${question.prompt_template} - ${chosen.snapshot}`,
    student_wrong_answer: chosen.text || input.option,
    correct_model_answer: "",
    source: "student",
  });

  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/**
 * "Add to my notebook" from a trivia checkpoint. Trivia is not syllabus content, so the entry has
 * no objective and no question to retry: it closes when the learner writes the answer and a
 * parent accepts it.
 */
export async function addTriviaMistake(
  learnerId: string,
  input: { questionId: string; option: string; errorTag: ErrorTag },
) {
  const supabase = await createServerClientInstance();
  const { data: question } = await supabase
    .from("learner_trivia_questions")
    .select("id, prompt, options")
    .eq("id", input.questionId)
    .maybeSingle();

  if (!question) return { ok: false as const, error: "That checkpoint is not available." };

  const chosen = chosenAnswer(optionList(question.options), input.option);
  const { error } = await supabase.from("mistake_notebook").insert({
    student_id: learnerId,
    error_category: input.errorTag,
    question_snapshot: `${question.prompt} - ${chosen.snapshot}`,
    student_wrong_answer: chosen.text || input.option,
    correct_model_answer: "",
    source: "student",
  });

  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export function countOpen(mistakes: Mistake[]) {
  return mistakes.filter((mistake) => mistake.status === "open").length;
}

export function countByTag(mistakes: Mistake[]) {
  const counts = new Map<ErrorTag, number>();
  for (const mistake of mistakes) {
    counts.set(mistake.errorTag, (counts.get(mistake.errorTag) ?? 0) + 1);
  }
  return counts;
}
