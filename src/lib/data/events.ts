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

/**
 * Mean score ratio per objective from every scored event (recall, application,
 * formal assessment, error correction). Lesson exposure carries no score and is
 * left out. Objectives with no scored event are absent, which pickWeakest
 * treats as weakest.
 */
export async function getObjectiveRatios(learnerId: string): Promise<Map<string, number>> {
  const ratios = new Map<string, number>();
  if (!learnerId) return ratios;

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("learning_events")
    .select("objective_id, score_ratio")
    .eq("student_id", learnerId)
    .neq("event_type", "Exposure_Lesson");

  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of data ?? []) {
    if (!row.objective_id) continue;
    const total = totals.get(row.objective_id) ?? { sum: 0, count: 0 };
    total.sum += Number(row.score_ratio);
    total.count += 1;
    totals.set(row.objective_id, total);
  }
  for (const [objectiveId, total] of totals) ratios.set(objectiveId, total.sum / total.count);
  return ratios;
}

/* ---------------------------------------------------------------- learner writes (Phase 4) */

async function objectiveIdFor(supabase: Awaited<ReturnType<typeof createServerClientInstance>>, objectiveCode: string) {
  const { data } = await supabase.from("learning_objectives").select("id").eq("objective_code", objectiveCode).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Lesson time. RLS allows the learner only unscored Exposure_Lesson rows for themselves. */
export async function logLessonTime(learnerId: string, objectiveCode: string, minutes: number) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("learning_events").insert({
    student_id: learnerId,
    objective_id: await objectiveIdFor(supabase, objectiveCode),
    event_type: "Exposure_Lesson",
    score_ratio: 0,
    actual_minutes_spent: minutes,
    flagged_stuck: false,
  });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** "I am stuck": an unscored flagged event plus the alert the parent sees. */
export async function flagStuck(learnerId: string, objectiveCode: string) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("learning_events").insert({
    student_id: learnerId,
    objective_id: await objectiveIdFor(supabase, objectiveCode),
    event_type: "Application_Question",
    score_ratio: 0,
    actual_minutes_spent: 0,
    flagged_stuck: true,
  });
  if (error) return { ok: false as const, error: error.message };

  const { error: alertError } = await supabase
    .from("kiosk_sessions")
    .insert({ student_id: learnerId, student_stuck_alert: true, session_start: new Date().toISOString() });
  return alertError ? { ok: false as const, error: alertError.message } : { ok: true as const };
}

/** Checks a checkpoint answer in Postgres, which also writes the scored event. */
export async function answerCheckpoint(questionId: string, option: string, kind: "recall" | "practice" = "recall") {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("answer_checkpoint", { p_question_id: questionId, p_option: option, p_kind: kind });
  if (error) return { ok: false as const, error: error.message };
  const row = (data as Array<{ correct: boolean; correct_option: string | null; explanation: string | null }>)?.[0];
  return {
    ok: true as const,
    correct: Boolean(row?.correct),
    correctOption: row?.correct_option ?? null,
    explanation: row?.explanation ?? "",
  };
}

/** A documentary checkpoint. Its score is computed in Postgres; the key never reaches the page. */
export async function answerTriviaCheckpoint(questionId: string, option: string) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("answer_trivia_checkpoint", { p_question_id: questionId, p_option: option });
  if (error) return { ok: false as const, error: error.message };
  const row = (data as Array<{ correct: boolean; correct_option: string | null; explanation: string | null }>)?.[0];
  return {
    ok: true as const,
    correct: Boolean(row?.correct),
    correctOption: row?.correct_option ?? null,
    explanation: row?.explanation ?? "",
  };
}
