import { unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type ObjectiveLabel = {
  id: string;
  code: string;
  title: string;
  topicId: string;
  topicCode: string;
  topicName: string;
  versionId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
};

/**
 * Objective -> topic -> syllabus version -> subject for a set of objective ids,
 * in four small reads, so any screen can say "0610 2.1 Cell structure" for a
 * row that only carries an objective id.
 */
export async function describeObjectives(objectiveIds: string[]): Promise<Map<string, ObjectiveLabel>> {
  const ids = unique(objectiveIds.filter(Boolean));
  const labels = new Map<string, ObjectiveLabel>();
  if (ids.length === 0) return labels;

  const supabase = await createServerClientInstance();
  const { data: objectives } = await supabase
    .from("learning_objectives")
    .select("id, objective_code, summary_title, topic_id")
    .in("id", ids);

  const topicIds = unique((objectives ?? []).map((row) => row.topic_id as string));
  const { data: topics } = topicIds.length
    ? await supabase.from("topics").select("id, topic_code, name, syllabus_version_id").in("id", topicIds)
    : { data: [] };

  const versionIds = unique((topics ?? []).map((row) => row.syllabus_version_id as string));
  const { data: versions } = versionIds.length
    ? await supabase.from("syllabus_versions").select("id, subject_id").in("id", versionIds)
    : { data: [] };

  const subjectIds = unique((versions ?? []).map((row) => row.subject_id as string));
  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, subject_code, subject_name").in("id", subjectIds)
    : { data: [] };

  const topicById = new Map((topics ?? []).map((row) => [row.id, row]));
  const versionById = new Map((versions ?? []).map((row) => [row.id, row]));
  const subjectById = new Map((subjects ?? []).map((row) => [row.id, row]));

  for (const objective of objectives ?? []) {
    const topic = topicById.get(objective.topic_id);
    const version = topic ? versionById.get(topic.syllabus_version_id) : undefined;
    const subject = version ? subjectById.get(version.subject_id) : undefined;
    if (!topic || !version || !subject) continue;

    labels.set(objective.id, {
      id: objective.id,
      code: objective.objective_code,
      title: objective.summary_title ?? "",
      topicId: topic.id,
      topicCode: topic.topic_code,
      topicName: topic.name,
      versionId: version.id,
      subjectId: subject.id,
      subjectCode: subject.subject_code,
      subjectName: subject.subject_name,
    });
  }

  return labels;
}

/** Assessment objectives (AO1, AO2, ...) imported for each syllabus version. */
export async function getAssessmentObjectives(versionIds: string[]) {
  const ids = unique(versionIds.filter(Boolean));
  if (ids.length === 0) return [];

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("assessment_objectives")
    .select("id, code, name, syllabus_version_id")
    .in("syllabus_version_id", ids)
    .order("code", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    versionId: row.syllabus_version_id as string,
  }));
}
