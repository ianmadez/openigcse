import { unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type LearningEvent = {
  id: string;
  objectiveCode: string | null;
  subjectCode: string | null;
  kind: "lesson" | "review" | "assessment" | "stuck";
  minutes: number;
  at: string;
};

const KIND: Record<string, LearningEvent["kind"]> = {
  Exposure_Lesson: "lesson",
  Active_Recall: "review",
  Application_Question: "review",
  Formal_Assessment: "assessment",
  Error_Correction: "review",
};

/** Events since a date, newest first, with the objective code for display. */
export async function getLearningEvents(learnerId: string, sinceIso?: string): Promise<LearningEvent[]> {
  if (!learnerId) return [];

  const supabase = await createServerClientInstance();
  let query = supabase
    .from("learning_events")
    .select("id, objective_id, event_type, actual_minutes_spent, flagged_stuck, created_at")
    .eq("student_id", learnerId)
    .order("created_at", { ascending: false });

  if (sinceIso) query = query.gte("created_at", sinceIso);

  const { data: rows } = await query;
  if (!rows?.length) return [];

  const objectiveIds = unique(rows.map((row) => row.objective_id).filter((id): id is string => Boolean(id)));
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

  return rows.map((row) => {
    const objective = row.objective_id ? objectiveById.get(row.objective_id) : undefined;
    const topic = objective ? topicById.get(objective.topic_id) : undefined;
    const version = topic ? versionById.get(topic.syllabus_version_id) : undefined;

    return {
      id: row.id,
      objectiveCode: objective?.objective_code ?? null,
      subjectCode: version ? (subjectById.get(version.subject_id) ?? null) : null,
      kind: row.flagged_stuck ? "stuck" : (KIND[row.event_type] ?? "lesson"),
      minutes: row.actual_minutes_spent ?? 0,
      at: row.created_at,
    };
  });
}

/** Minutes recorded since a date, per subject, for the progress screens. */
export function minutesBySubject(events: LearningEvent[]) {
  const totals = new Map<string, number>();
  for (const event of events) {
    const key = event.subjectCode ?? "unassigned";
    totals.set(key, (totals.get(key) ?? 0) + event.minutes);
  }
  return totals;
}

export function minutesSince(events: LearningEvent[], sinceIso: string) {
  return events
    .filter((event) => event.at >= sinceIso)
    .reduce((sum, event) => sum + event.minutes, 0);
}
