import { collect, slugify, unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

/** A subject the learner is entered for this term, resolved to its route. */
export type EnrolledSubject = {
  enrollmentId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  slug: string;
  category: string;
  masteryMode: string;
  isElective: boolean;
  weeklyMinutes: number;
  targetGrade: string | null;
  routeId: string;
  routeCode: string;
  routeName: string;
  tier: string;
  versionId: string;
  versionLabel: string;
  versionStatus: string;
};

type EnrollmentRow = {
  id: string;
  entry_route_id: string | null;
  is_elective: boolean | null;
  weekly_allocated_minutes: number | null;
  target_grade: string | null;
};

/**
 * Enrolments for one learner and term. The route is what ties an enrolment to a
 * syllabus version, and the version is what ties it to a subject, so the three
 * tables are joined here rather than in a nested PostgREST select.
 */
export async function getEnrollments(learnerId: string, termId: string): Promise<EnrolledSubject[]> {
  if (!learnerId || !termId) return [];

  const supabase = await createServerClientInstance();

  const { data: enrollments } = await supabase
    .from("learner_term_enrollments")
    .select("id, entry_route_id, is_elective, weekly_allocated_minutes, target_grade")
    .eq("student_id", learnerId)
    .eq("academic_term_id", termId);

  const rows = (enrollments ?? []) as EnrollmentRow[];
  const routeIds = unique(rows.map((row) => row.entry_route_id).filter((id): id is string => Boolean(id)));
  if (routeIds.length === 0) return [];

  const { data: routes } = await supabase
    .from("entry_routes")
    .select("id, route_code, name, tier, syllabus_version_id")
    .in("id", routeIds);

  const versionIds = unique(
    (routes ?? []).map((route) => route.syllabus_version_id).filter((id): id is string => Boolean(id)),
  );
  if (versionIds.length === 0) return [];

  const { data: versions } = await supabase
    .from("syllabus_versions")
    .select("id, version_label, status, subject_id")
    .in("id", versionIds);

  const subjectIds = unique(
    (versions ?? []).map((version) => version.subject_id).filter((id): id is string => Boolean(id)),
  );
  if (subjectIds.length === 0) return [];

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, subject_code, subject_name, category, mastery_mode")
    .in("id", subjectIds);

  const routeById = new Map((routes ?? []).map((route) => [route.id, route]));
  const versionById = new Map((versions ?? []).map((version) => [version.id, version]));
  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject]));

  const resolved: EnrolledSubject[] = [];

  for (const enrollment of rows) {
    const route = enrollment.entry_route_id ? routeById.get(enrollment.entry_route_id) : undefined;
    const version = route ? versionById.get(route.syllabus_version_id) : undefined;
    const subject = version ? subjectById.get(version.subject_id) : undefined;
    if (!route || !version || !subject) continue;

    resolved.push({
      enrollmentId: enrollment.id,
      subjectId: subject.id,
      subjectCode: subject.subject_code,
      subjectName: subject.subject_name,
      slug: slugify(subject.subject_name),
      category: subject.category,
      masteryMode: subject.mastery_mode,
      isElective: Boolean(enrollment.is_elective),
      weeklyMinutes: enrollment.weekly_allocated_minutes ?? 0,
      targetGrade: enrollment.target_grade,
      routeId: route.id,
      routeCode: route.route_code,
      routeName: route.name,
      tier: route.tier ?? "Untiered",
      versionId: version.id,
      versionLabel: version.version_label,
      versionStatus: version.status ?? "draft",
    });
  }

  return resolved.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
}

/** Elective options for the term planner: the subject families a family can add. */
export async function getElectiveOptions() {  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("subjects")
    .select("subject_code, subject_name, category")
    .eq("category", "Languages")
    .order("subject_code", { ascending: true });

  return (data ?? []).map((row) => ({
    code: row.subject_code as string,
    name: row.subject_name as string,
    slug: slugify(row.subject_name as string),
  }));
}

export { collect };
