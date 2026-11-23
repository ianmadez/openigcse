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
};

type MistakeRow = {
  id: string;
  objective_id: string | null;
  error_category: ErrorTag;
  question_snapshot: string;
  student_reflection: string | null;
  resolved: boolean | null;
  created_at: string;
};

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
    .select("id, objective_id, error_category, question_snapshot, student_reflection, resolved, created_at")
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
    };
  });
}

/**
 * Marks one mistake fixed. Runs on the session client, so RLS decides whether
 * this learner owns the row: there is no service-role bypass on this path.
 */
export async function resolveMistake(mistakeId: string) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("mistake_notebook").update({ resolved: true }).eq("id", mistakeId);

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
