import { getEnrollments, type EnrolledSubject } from "@/lib/data/enrollments";
import { collect, slugify, unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * Curriculum reads, scoped to what the learner is actually entered for.
 *
 * The syllabus lives in Postgres (subjects -> syllabus_versions -> topics ->
 * learning_objectives), not in bundled JSON, so a package can be replaced
 * without a redeploy.
 */

export type CurriculumSubtopic = { id: string; code: string; name: string };

export type CurriculumTopic = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  subtopics: CurriculumSubtopic[];
};

export type CurriculumObjective = {
  id: string;
  code: string;
  text: string;
  tier: string;
  commandWords: string[];
  topicCode: string;
  topicName: string;
};

export type SubjectResource = {
  id: string;
  title: string;
  resourceType: string;
  url: string | null;
  youtubeVideoId: string | null;
  startSeconds: number;
  endSeconds: number | null;
  objectiveCode: string;
};

export type SubjectCurriculum = EnrolledSubject & {
  topics: CurriculumTopic[];
  objectives: CurriculumObjective[];
  resources: SubjectResource[];
  counts: { topics: number; subtopics: number; objectives: number };
};

type TopicRow = {
  id: string;
  syllabus_version_id: string;
  parent_topic_id: string | null;
  topic_code: string;
  name: string;
  sequence: number;
};

type ObjectiveRow = {
  id: string;
  topic_id: string;
  objective_code: string;
  summary_title: string;
  official_description: string;
  tier: string | null;
  command_words: string[] | null;
};

type ActivityRow = { objective_id: string; resource_id: string | null };

type ResourceRow = {
  id: string;
  title: string;
  resource_type: string | null;
  external_url: string | null;
  youtube_video_id: string | null;
  start_timestamp_seconds: number | null;
  end_timestamp_seconds: number | null;
};

async function loadSubjectBodies(
  enrollments: EnrolledSubject[],
): Promise<Map<string, Omit<SubjectCurriculum, keyof EnrolledSubject>>> {
  const supabase = await createServerClientInstance();
  const bodies = new Map<string, Omit<SubjectCurriculum, keyof EnrolledSubject>>();

  if (enrollments.length === 0) return bodies;

  const versionIds = unique(enrollments.map((enrollment) => enrollment.versionId));

  const topics = await collect<TopicRow>(versionIds, async (batch) => {
    const { data } = await supabase
      .from("topics")
      .select("id, syllabus_version_id, parent_topic_id, topic_code, name, sequence")
      .in("syllabus_version_id", batch)
      .order("sequence", { ascending: true });
    return (data ?? []) as TopicRow[];
  });

  const topicIds = topics.map((topic) => topic.id);
  const objectives = await collect<ObjectiveRow>(topicIds, async (batch) => {
    const { data } = await supabase
      .from("learning_objectives")
      .select("id, topic_id, objective_code, summary_title, official_description, tier, command_words")
      .in("topic_id", batch)
      .order("sequence", { ascending: true });
    return (data ?? []) as ObjectiveRow[];
  });

  const activities = await collect<ActivityRow>(
    objectives.map((objective) => objective.id),
    async (batch) => {
      const { data } = await supabase
        .from("activities")
        .select("objective_id, resource_id")
        .in("objective_id", batch)
        .not("resource_id", "is", null);
      return (data ?? []) as ActivityRow[];
    },
  );

  const resourceRows = await collect<ResourceRow>(
    activities.map((activity) => activity.resource_id).filter((id): id is string => Boolean(id)),
    async (batch) => {
      const { data } = await supabase
        .from("resources")
        .select(
          "id, title, resource_type, external_url, youtube_video_id, start_timestamp_seconds, end_timestamp_seconds",
        )
        .in("id", batch);
      return (data ?? []) as ResourceRow[];
    },
  );

  const resourceById = new Map(resourceRows.map((row) => [row.id, row]));
  const objectiveById = new Map(objectives.map((row) => [row.id, row]));
  const topicById = new Map(topics.map((row) => [row.id, row]));

  for (const enrollment of enrollments) {
    const versionTopics = topics.filter((topic) => topic.syllabus_version_id === enrollment.versionId);
    const versionTopicIds = new Set(versionTopics.map((topic) => topic.id));
    const versionObjectives = objectives.filter((objective) => versionTopicIds.has(objective.topic_id));

    const subtopicsByParent = new Map<string, CurriculumSubtopic[]>();
    const roots: CurriculumTopic[] = [];

    for (const topic of versionTopics) {
      if (topic.parent_topic_id) {
        const list = subtopicsByParent.get(topic.parent_topic_id) ?? [];
        list.push({ id: topic.id, code: topic.topic_code, name: topic.name });
        subtopicsByParent.set(topic.parent_topic_id, list);
      } else {
        roots.push({
          id: topic.id,
          code: topic.topic_code,
          name: topic.name,
          sequence: topic.sequence,
          subtopics: [],
        });
      }
    }

    for (const topic of roots) {
      topic.subtopics = subtopicsByParent.get(topic.id) ?? [];
    }

    const objectiveList: CurriculumObjective[] = versionObjectives.map((objective) => {
      const topic = topicById.get(objective.topic_id);
      return {
        id: objective.id,
        code: objective.objective_code,
        text: objective.official_description || objective.summary_title,
        tier: objective.tier ?? "Untiered",
        commandWords: objective.command_words ?? [],
        topicCode: topic?.topic_code ?? "",
        topicName: topic?.name ?? "",
      };
    });

    const resources: SubjectResource[] = [];
    const objectiveCodeById = new Map(versionObjectives.map((objective) => [objective.id, objective.objective_code]));

    for (const activity of activities) {
      const code = objectiveCodeById.get(activity.objective_id);
      if (!code || !activity.resource_id) continue;
      const resource = resourceById.get(activity.resource_id);
      if (!resource) continue;

      resources.push({
        id: resource.id,
        title: resource.title,
        resourceType: resource.resource_type ?? "Resource",
        url: resource.external_url,
        youtubeVideoId: resource.youtube_video_id,
        startSeconds: resource.start_timestamp_seconds ?? 0,
        endSeconds: resource.end_timestamp_seconds,
        objectiveCode: code,
      });
    }

    bodies.set(enrollment.subjectCode, {
      topics: roots.sort((a, b) => a.sequence - b.sequence),
      objectives: objectiveList,
      resources,
      counts: {
        topics: roots.length,
        subtopics: versionTopics.length - roots.length,
        objectives: objectiveList.length,
      },
    });
  }

  return bodies;
}

/** Every enrolled subject with its topics, objectives and resources. */
export async function getEnrolledCurriculum(learnerId: string, termId: string): Promise<SubjectCurriculum[]> {
  const enrollments = await getEnrollments(learnerId, termId);
  const bodies = await loadSubjectBodies(enrollments);

  return enrollments.map((enrollment) => ({
    ...enrollment,
    ...(bodies.get(enrollment.subjectCode) ?? {
      topics: [],
      objectives: [],
      resources: [],
      counts: { topics: 0, subtopics: 0, objectives: 0 },
    }),
  }));
}

export async function getSubjectCurriculum(
  learnerId: string,
  termId: string,
  slug: string,
): Promise<SubjectCurriculum | null> {
  const all = await getEnrolledCurriculum(learnerId, termId);
  return all.find((subject) => subject.slug === slug) ?? null;
}

/** Subjects a family can enrol in, for onboarding and the term planner. */
export async function getAvailableSubjects() {
  const supabase = await createServerClientInstance();

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, subject_code, subject_name, category")
    .order("subject_code", { ascending: true });

  if (!subjects?.length) return [];

  const { data: versions } = await supabase
    .from("syllabus_versions")
    .select("id, subject_id, version_label, status")
    .in(
      "subject_id",
      subjects.map((subject) => subject.id),
    );

  const versionIds = (versions ?? []).map((version) => version.id);
  const { data: routes } = versionIds.length
    ? await supabase
        .from("entry_routes")
        .select("id, syllabus_version_id, private_candidate_eligible")
        .in("syllabus_version_id", versionIds)
    : { data: [] as { id: string; syllabus_version_id: string; private_candidate_eligible: boolean | null }[] };

  const { data: components } = versionIds.length
    ? await supabase.from("components").select("id, syllabus_version_id").in("syllabus_version_id", versionIds)
    : { data: [] as { id: string; syllabus_version_id: string }[] };

  const versionBySubject = new Map((versions ?? []).map((version) => [version.subject_id, version]));
  const routeVersionIds = new Set((routes ?? []).map((route) => route.syllabus_version_id));
  const papersByVersion = new Map<string, number>();
  for (const component of components ?? []) {
    papersByVersion.set(component.syllabus_version_id, (papersByVersion.get(component.syllabus_version_id) ?? 0) + 1);
  }

  return subjects
    .map((subject) => {
      const version = versionBySubject.get(subject.id);
      return {
        code: subject.subject_code as string,
        name: subject.subject_name as string,
        slug: slugify(subject.subject_name as string),
        category: subject.category as string,
        isElective: subject.category === "Languages",
        versionLabel: version?.version_label ?? null,
        hasPrivateRoute: version ? routeVersionIds.has(version.id) : false,
        papers: version ? (papersByVersion.get(version.id) ?? 0) : 0,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export type CurriculumTotals = { topics: number; objectives: number; subjects: number };

export function totalsFor(subjects: SubjectCurriculum[]): CurriculumTotals {
  return {
    subjects: subjects.length,
    topics: subjects.reduce((sum, subject) => sum + subject.counts.topics, 0),
    objectives: subjects.reduce((sum, subject) => sum + subject.counts.objectives, 0),
  };
}
