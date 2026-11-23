import { sittingState } from "@/lib/assessment/builder";
import type { QuestionInput, QuestionKind, QuestionRow } from "@/lib/assessment/question";
import { signedUrls } from "@/lib/data/files";
import { describeObjectives, type ObjectiveLabel } from "@/lib/data/objectives";
import { collect } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type QuestionFilters = {
  subject?: string;
  topic?: string;
  objective?: string;
  tier?: string;
  kind?: string;
  difficulty?: string;
};

export type QuestionSummary = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  marks: number;
  tier: string;
  difficulty: string;
  objective: ObjectiveLabel | null;
  usedIn: number;
  createdAt: string;
};

type Row = {
  id: string;
  question_type: QuestionKind;
  prompt_template: string;
  max_marks: number;
  tier: string;
  difficulty: string | null;
  objective_id: string | null;
  created_at: string;
};

const LIMIT = 500;

/** The household's bank, newest first, with each question's objective and how many assessments use it. */
export async function listQuestions(householdId: string, filters: QuestionFilters = {}): Promise<QuestionSummary[]> {
  const supabase = await createServerClientInstance();
  let query = supabase
    .from("question_templates")
    .select("id, question_type, prompt_template, max_marks, tier, difficulty, objective_id, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (filters.kind) query = query.eq("question_type", filters.kind);
  if (filters.tier) query = query.eq("tier", filters.tier);
  if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
  if (filters.objective) query = query.eq("objective_id", filters.objective);

  const { data } = await query;
  const rows = (data ?? []) as Row[];

  const [labels, usage] = await Promise.all([
    describeObjectives(rows.map((row) => row.objective_id ?? "")),
    collect<{ question_template_id: string }>(
      rows.map((row) => row.id),
      async (batch) =>
        (await supabase.from("assessment_items").select("question_template_id").in("question_template_id", batch)).data,
    ),
  ]);

  const usedIn = new Map<string, number>();
  for (const item of usage) usedIn.set(item.question_template_id, (usedIn.get(item.question_template_id) ?? 0) + 1);

  return rows
    .map((row) => ({
      id: row.id,
      kind: row.question_type,
      prompt: row.prompt_template,
      marks: row.max_marks,
      tier: row.tier,
      difficulty: row.difficulty ?? "Standard",
      objective: row.objective_id ? (labels.get(row.objective_id) ?? null) : null,
      usedIn: usedIn.get(row.id) ?? 0,
      createdAt: row.created_at,
    }))
    .filter((question) => !filters.subject || question.objective?.subjectCode === filters.subject)
    .filter((question) => !filters.topic || question.objective?.topicCode === filters.topic);
}

export type QuestionDetail = QuestionInput & { id: string; imageUrls: Record<string, string>; usedIn: number };

export async function getQuestion(id: string): Promise<QuestionDetail | null> {
  const supabase = await createServerClientInstance();
  const { data: row } = await supabase
    .from("question_templates")
    .select(
      "id, question_type, objective_id, assessment_objective_id, tier, difficulty, prompt_template, options_schema, parts, max_marks, model_answer, mark_scheme_rubric, image_paths",
    )
    .eq("id", id)
    .maybeSingle();

  if (!row) return null;

  const [urls, { count }] = await Promise.all([
    signedUrls(row.image_paths ?? []),
    supabase.from("assessment_items").select("id", { count: "exact", head: true }).eq("question_template_id", id),
  ]);

  const options = Array.isArray(row.options_schema)
    ? (row.options_schema as Array<{ letter: QuestionInput["options"][number]["letter"]; text: string; correct?: boolean }>)
    : [];

  return {
    id: row.id,
    kind: row.question_type,
    objectiveId: row.objective_id,
    assessmentObjectiveId: row.assessment_objective_id,
    tier: row.tier,
    difficulty: row.difficulty ?? "Standard",
    prompt: row.prompt_template,
    options: options.map(({ letter, text }) => ({ letter, text })),
    correctOption: options.find((option) => option.correct)?.letter ?? null,
    parts: Array.isArray(row.parts) ? row.parts : [],
    marks: row.max_marks,
    modelAnswer: row.question_type === "MCQ" ? "" : (row.model_answer ?? ""),
    markScheme: row.mark_scheme_rubric ?? "",
    imagePaths: row.image_paths ?? [],
    imageUrls: Object.fromEntries(urls),
    usedIn: count ?? 0,
  };
}

/** Insert or update. Returns the id so a new question can open in its own editor. */
export async function saveQuestion(row: QuestionRow & { created_by?: string | null }, id?: string) {
  const supabase = await createServerClientInstance();
  const { data, error } = id
    ? await supabase.from("question_templates").update(row).eq("id", id).select("id")
    : await supabase.from("question_templates").insert(row).select("id");

  if (error) return { ok: false as const, error: error.message };
  const saved = data?.[0]?.id as string | undefined;
  if (!saved) return { ok: false as const, error: "The question was not saved. Sign in as the guardian and try again." };
  return { ok: true as const, id: saved };
}

/**
 * Deleting a question cascades to every assessment item and mark that uses it,
 * which would quietly rewrite a marked paper. So a question in use stays.
 */
export async function deleteQuestion(id: string) {
  const supabase = await createServerClientInstance();
  const { count } = await supabase
    .from("assessment_items")
    .select("id", { count: "exact", head: true })
    .eq("question_template_id", id);

  if ((count ?? 0) > 0) {
    return { ok: false as const, error: `This question is on ${count} assessment${count === 1 ? "" : "s"}. Remove it there first.` };
  }

  const { data, error } = await supabase.from("question_templates").delete().eq("id", id).select("id, image_paths");
  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "Nothing was deleted. Sign in as the guardian and try again." };
  return { ok: true as const, imagePaths: (data[0]?.image_paths ?? []) as string[] };
}

export type ObjectiveTree = Array<{
  subjectCode: string;
  subjectName: string;
  versionId: string;
  topics: Array<{ code: string; name: string; objectives: Array<{ id: string; code: string; title: string }> }>;
}>;

/**
 * Subject -> topic -> objective for the learner's enrolled routes: what the
 * question editor and the bank filters choose from.
 */
export function objectiveTree(
  subjects: Array<{
    subjectCode: string;
    subjectName: string;
    versionId: string;
    objectives: Array<{ id: string; code: string; text: string; topicCode: string; topicName: string }>;
  }>,
): ObjectiveTree {
  return subjects.map((subject) => {
    const topics = new Map<string, { code: string; name: string; objectives: Array<{ id: string; code: string; title: string }> }>();
    for (const objective of subject.objectives) {
      const key = objective.topicCode || "-";
      const topic = topics.get(key) ?? { code: key, name: objective.topicName, objectives: [] };
      topic.objectives.push({
        id: objective.id,
        code: objective.code,
        title: objective.text.length > 90 ? `${objective.text.slice(0, 87)}...` : objective.text,
      });
      topics.set(key, topic);
    }
    return {
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      versionId: subject.versionId,
      topics: [...topics.values()],
    };
  });
}

/** Where each assessment that uses this question stands, for the edit lock. */
export async function questionUsageStates(questionId: string, now: Date = new Date()) {
  const supabase = await createServerClientInstance();
  const { data: items } = await supabase.from("assessment_items").select("assessment_id").eq("question_template_id", questionId);
  const ids = (items ?? []).map((item) => item.assessment_id as string);
  if (ids.length === 0) return [];

  const [{ data: assessments }, { data: sittings }] = await Promise.all([
    supabase.from("term_assessments").select("id, status, duration_minutes").in("id", ids),
    supabase.from("assessment_sittings").select("assessment_id, started_at, submitted_at").in("assessment_id", ids),
  ]);
  const sittingById = new Map((sittings ?? []).map((row) => [row.assessment_id, row]));

  return (assessments ?? []).map((assessment) => {
    const sitting = sittingById.get(assessment.id);
    return sittingState(
      {
        status: assessment.status ?? "Scheduled",
        durationMinutes: assessment.duration_minutes,
        sitting: sitting ? { startedAt: sitting.started_at, submittedAt: sitting.submitted_at } : null,
      },
      now,
    );
  });
}
