import { cache } from "react";

import { collect, slugify } from "@/lib/data/query";
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
  targetExamSeries: string | null;
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
  target_exam_series: string | null;
};

/**
 * Enrolments for one learner and term. The route is what ties an enrolment to a
 * syllabus version, and the version is what ties it to a subject, so the three
 * tables are joined here rather than in a nested PostgREST select.
 *
 * Routes, versions and subjects are a small shared catalogue (tens of rows), so all four reads
 * go out together: one round trip instead of four in a row. `cache` lets the layout and the
 * page share one read per request.
 */
export const getEnrollments = cache(async (learnerId: string, termId: string): Promise<EnrolledSubject[]> => {
  if (!learnerId || !termId) return [];

  const supabase = await createServerClientInstance();

  const [{ data: enrollments }, { data: routes }, { data: versions }, { data: subjects }] = await Promise.all([
    supabase
      .from("learner_term_enrollments")
      .select("id, entry_route_id, is_elective, weekly_allocated_minutes, target_grade, target_exam_series")
      .eq("student_id", learnerId)
      .eq("academic_term_id", termId),
    supabase.from("entry_routes").select("id, route_code, name, tier, syllabus_version_id"),
    supabase.from("syllabus_versions").select("id, version_label, status, subject_id"),
    supabase.from("subjects").select("id, subject_code, subject_name, category, mastery_mode"),
  ]);

  const rows = (enrollments ?? []) as EnrollmentRow[];
  if (rows.length === 0) return [];

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
      targetExamSeries: enrollment.target_exam_series,
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
});

export type RouteOption = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  category: string;
  versionLabel: string;
  versionStatus: string;
  routes: Array<{
    id: string;
    code: string;
    name: string;
    tier: string;
    privateCandidateEligible: boolean;
    notes: string | null;
  }>;
};

/** Every subject that has at least one entry route, with all of its routes. */
export async function getRouteOptions(): Promise<RouteOption[]> {
  const supabase = await createServerClientInstance();

  const [{ data: subjects }, { data: versions }, { data: routes }] = await Promise.all([
    supabase.from("subjects").select("id, subject_code, subject_name, category"),
    supabase.from("syllabus_versions").select("id, subject_id, version_label, status"),
    supabase.from("entry_routes").select("id, syllabus_version_id, route_code, name, tier, private_candidate_eligible, notes"),
  ]);

  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject]));
  const options = new Map<string, RouteOption>();

  for (const version of versions ?? []) {
    const subject = subjectById.get(version.subject_id);
    const versionRoutes = (routes ?? []).filter((route) => route.syllabus_version_id === version.id);
    if (!subject || versionRoutes.length === 0) continue;

    options.set(version.id, {
      subjectId: subject.id,
      subjectCode: subject.subject_code,
      subjectName: subject.subject_name,
      category: subject.category,
      versionLabel: version.version_label,
      versionStatus: version.status ?? "draft",
      routes: versionRoutes
        .map((route) => ({
          id: route.id,
          code: route.route_code,
          name: route.name,
          tier: route.tier ?? "Untiered",
          privateCandidateEligible: route.private_candidate_eligible !== false,
          notes: route.notes ?? null,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    });
  }

  return [...options.values()].sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
}

export type EnrollmentInput = {
  routeId: string;
  isElective: boolean;
  weeklyMinutes: number;
  targetGrade: string;
  targetExamSeries: string | null;
};

/**
 * Makes the learner's enrolments for one term exactly `rows`: upserted on
 * (student, term, route), and any route no longer chosen removed afterwards so
 * a failed upsert never leaves the learner with nothing.
 */
export async function replaceEnrollments(learnerId: string, termId: string, rows: EnrollmentInput[]) {
  const supabase = await createServerClientInstance();

  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("learner_term_enrollments")
      .upsert(
        rows.map((row) => ({
          student_id: learnerId,
          academic_term_id: termId,
          entry_route_id: row.routeId,
          is_elective: row.isElective,
          weekly_allocated_minutes: row.weeklyMinutes,
          target_grade: row.targetGrade,
          target_exam_series: row.targetExamSeries,
        })),
        { onConflict: "student_id,academic_term_id,entry_route_id" },
      )
      .select("id");

    if (error) return { ok: false as const, error: error.message };
    if ((data ?? []).length !== rows.length) {
      return { ok: false as const, error: "Some subjects were not saved. Sign in as the guardian and try again." };
    }
  }

  let removal = supabase.from("learner_term_enrollments").delete().eq("student_id", learnerId).eq("academic_term_id", termId);
  if (rows.length > 0) removal = removal.not("entry_route_id", "in", `(${rows.map((row) => row.routeId).join(",")})`);

  const { error: removeError } = await removal;
  return removeError ? { ok: false as const, error: removeError.message } : { ok: true as const };
}

export { collect };
