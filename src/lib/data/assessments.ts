import { daysUntil } from "@/lib/data/dates";
import { unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type AssessmentKind = "weekly_quiz" | "topic_test" | "mid_term" | "final" | "past_paper";

export type Assessment = {
  id: string;
  kind: AssessmentKind;
  title: string;
  subjectCode: string | null;
  component: string | null;
  scheduledFor: string;
  daysUntil: number;
  durationMinutes: number | null;
  totalMarks: number | null;
  status: "draft" | "scheduled" | "submitted" | "marked";
};

const KIND: Record<string, AssessmentKind> = {
  WeeklyQuiz: "weekly_quiz",
  TopicTest: "topic_test",
  MidTermExam: "mid_term",
  FinalTermExam: "final",
  TimedPastPaper: "past_paper",
};

const STATUS: Record<string, Assessment["status"]> = {
  Draft: "draft",
  Scheduled: "scheduled",
  Submitted: "submitted",
  Marked: "marked",
};

/** Assessments scheduled inside one term, with the subject each one belongs to. */
export async function getTermAssessments(termId: string, now: Date = new Date()): Promise<Assessment[]> {
  if (!termId) return [];

  const supabase = await createServerClientInstance();
  const { data: rows } = await supabase
    .from("term_assessments")
    .select(
      "id, entry_route_id, component_id, assessment_category, title, duration_minutes, total_marks, scheduled_date, status",
    )
    .eq("academic_term_id", termId)
    .order("scheduled_date", { ascending: true, nullsFirst: false });

  if (!rows?.length) return [];

  const routeIds = unique(rows.map((row) => row.entry_route_id).filter((id): id is string => Boolean(id)));
  const componentIds = unique(rows.map((row) => row.component_id).filter((id): id is string => Boolean(id)));

  const [{ data: routes }, { data: components }] = await Promise.all([
    routeIds.length
      ? supabase.from("entry_routes").select("id, syllabus_version_id").in("id", routeIds)
      : Promise.resolve({ data: [] as { id: string; syllabus_version_id: string }[] }),
    componentIds.length
      ? supabase.from("components").select("id, component_code").in("id", componentIds)
      : Promise.resolve({ data: [] as { id: string; component_code: string }[] }),
  ]);

  const versionIds = unique((routes ?? []).map((route) => route.syllabus_version_id));
  const { data: versions } = versionIds.length
    ? await supabase.from("syllabus_versions").select("id, subject_id").in("id", versionIds)
    : { data: [] as { id: string; subject_id: string }[] };

  const subjectIds = unique((versions ?? []).map((version) => version.subject_id));
  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, subject_code").in("id", subjectIds)
    : { data: [] as { id: string; subject_code: string }[] };

  const versionById = new Map((versions ?? []).map((version) => [version.id, version]));
  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject.subject_code]));
  const routeById = new Map((routes ?? []).map((route) => [route.id, route]));
  const componentById = new Map((components ?? []).map((component) => [component.id, component.component_code]));

  return rows.map((row) => {
    const route = row.entry_route_id ? routeById.get(row.entry_route_id) : undefined;
    const version = route ? versionById.get(route.syllabus_version_id) : undefined;

    return {
      id: row.id,
      kind: KIND[row.assessment_category] ?? "weekly_quiz",
      title: row.title,
      subjectCode: version ? (subjectById.get(version.subject_id) ?? null) : null,
      component: row.component_id ? (componentById.get(row.component_id) ?? null) : null,
      scheduledFor: row.scheduled_date ?? "",
      daysUntil: row.scheduled_date ? daysUntil(row.scheduled_date, now) : 0,
      durationMinutes: row.duration_minutes ?? null,
      totalMarks: row.total_marks ?? null,
      status: STATUS[row.status ?? "Scheduled"] ?? "scheduled",
    };
  });
}
