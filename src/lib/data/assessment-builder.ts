import { sittingState, type SittingState } from "@/lib/assessment/builder";
import type { GradeThreshold } from "@/lib/assessment/scoring";
import { describeObjectives, type ObjectiveLabel } from "@/lib/data/objectives";
import { unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

const COLUMNS =
  "id, academic_term_id, entry_route_id, student_id, assessment_category, title, duration_minutes, total_marks, scheduled_date, status, student_score, parent_overall_feedback, paper_code, exam_series, paper_variant, paper_url, grade_thresholds, marked_at";

type AssessmentRow = {
  id: string;
  academic_term_id: string;
  entry_route_id: string | null;
  student_id: string | null;
  assessment_category: string;
  title: string;
  duration_minutes: number;
  total_marks: number;
  scheduled_date: string | null;
  status: string | null;
  student_score: number | null;
  parent_overall_feedback: string | null;
  paper_code: string | null;
  exam_series: string | null;
  paper_variant: string | null;
  paper_url: string | null;
  grade_thresholds: GradeThreshold[] | null;
  marked_at: string | null;
};

export type AssessmentSummary = {
  id: string;
  title: string;
  category: string;
  status: string;
  state: SittingState;
  subjectCode: string | null;
  subjectName: string | null;
  scheduledDate: string | null;
  durationMinutes: number;
  totalMarks: number;
  studentScore: number | null;
  studentId: string | null;
  sitting: { id: string; startedAt: string; submittedAt: string | null; extraMinutes?: number } | null;
};

export type AssessmentItem = {
  questionId: string;
  sequence: number;
  marks: number;
  kind: string;
  prompt: string;
  objective: ObjectiveLabel | null;
};

export type AssessmentDetail = AssessmentSummary & {
  termId: string;
  routeId: string | null;
  versionId: string | null;
  paperCode: string | null;
  examSeries: string | null;
  paperVariant: string | null;
  paperUrl: string | null;
  thresholds: GradeThreshold[];
  feedback: string | null;
  markedAt: string | null;
  items: AssessmentItem[];
};

async function subjectsForRoutes(routeIds: string[]) {
  const supabase = await createServerClientInstance();
  const ids = unique(routeIds.filter(Boolean));
  const result = new Map<string, { versionId: string; subjectCode: string; subjectName: string }>();
  if (ids.length === 0) return result;

  const { data: routes } = await supabase.from("entry_routes").select("id, syllabus_version_id").in("id", ids);
  const versionIds = unique((routes ?? []).map((route) => route.syllabus_version_id as string));
  const { data: versions } = versionIds.length
    ? await supabase.from("syllabus_versions").select("id, subject_id").in("id", versionIds)
    : { data: [] };
  const subjectIds = unique((versions ?? []).map((version) => version.subject_id as string));
  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, subject_code, subject_name").in("id", subjectIds)
    : { data: [] };

  const versionById = new Map((versions ?? []).map((version) => [version.id, version]));
  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject]));
  for (const route of routes ?? []) {
    const version = versionById.get(route.syllabus_version_id);
    const subject = version ? subjectById.get(version.subject_id) : undefined;
    if (version && subject) {
      result.set(route.id, { versionId: version.id, subjectCode: subject.subject_code, subjectName: subject.subject_name });
    }
  }
  return result;
}

async function sittingsFor(assessmentIds: string[]) {
  const supabase = await createServerClientInstance();
  if (assessmentIds.length === 0) return new Map<string, AssessmentSummary["sitting"]>();
  const { data } = await supabase
    .from("assessment_sittings")
    .select("id, assessment_id, started_at, submitted_at, extra_minutes")
    .in("assessment_id", assessmentIds);
  return new Map(
    (data ?? []).map((row) => [row.assessment_id as string, { id: row.id, startedAt: row.started_at, submittedAt: row.submitted_at, extraMinutes: Number(row.extra_minutes ?? 0) }]),
  );
}

function summarise(
  row: AssessmentRow,
  subject: { subjectCode: string; subjectName: string } | undefined,
  sitting: AssessmentSummary["sitting"],
  now: Date,
): AssessmentSummary {
  const status = row.status ?? "Scheduled";
  return {
    id: row.id,
    title: row.title,
    category: row.assessment_category,
    status,
    state: sittingState({ status, durationMinutes: row.duration_minutes + (sitting?.extraMinutes ?? 0), sitting }, now),
    subjectCode: subject?.subjectCode ?? null,
    subjectName: subject?.subjectName ?? null,
    scheduledDate: row.scheduled_date,
    durationMinutes: row.duration_minutes,
    totalMarks: row.total_marks,
    studentScore: row.student_score === null ? null : Number(row.student_score),
    studentId: row.student_id,
    sitting,
  };
}

/** Every assessment in the household's terms, newest date first. */
export async function listAssessments(termIds: string[], now: Date = new Date()): Promise<AssessmentSummary[]> {
  if (termIds.length === 0) return [];
  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("term_assessments")
    .select(COLUMNS)
    .in("academic_term_id", termIds)
    .order("scheduled_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as AssessmentRow[];
  const [subjects, sittings] = await Promise.all([
    subjectsForRoutes(rows.map((row) => row.entry_route_id ?? "")),
    sittingsFor(rows.map((row) => row.id)),
  ]);

  return rows.map((row) =>
    summarise(row, row.entry_route_id ? subjects.get(row.entry_route_id) : undefined, sittings.get(row.id) ?? null, now),
  );
}

export async function getAssessmentDetail(id: string, now: Date = new Date()): Promise<AssessmentDetail | null> {
  const supabase = await createServerClientInstance();
  const { data } = await supabase.from("term_assessments").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as AssessmentRow;

  const [subjects, sittings, { data: itemRows }] = await Promise.all([
    subjectsForRoutes([row.entry_route_id ?? ""]),
    sittingsFor([row.id]),
    supabase
      .from("assessment_items")
      .select("question_template_id, sequence, marks_available")
      .eq("assessment_id", id)
      .order("sequence", { ascending: true }),
  ]);

  const questionIds = (itemRows ?? []).map((item) => item.question_template_id as string);
  const { data: questions } = questionIds.length
    ? await supabase.from("question_templates").select("id, question_type, prompt_template, objective_id").in("id", questionIds)
    : { data: [] };
  const labels = await describeObjectives((questions ?? []).map((question) => question.objective_id ?? ""));
  const questionById = new Map((questions ?? []).map((question) => [question.id, question]));

  const subject = row.entry_route_id ? subjects.get(row.entry_route_id) : undefined;
  return {
    ...summarise(row, subject, sittings.get(row.id) ?? null, now),
    termId: row.academic_term_id,
    routeId: row.entry_route_id,
    versionId: subject?.versionId ?? null,
    paperCode: row.paper_code,
    examSeries: row.exam_series,
    paperVariant: row.paper_variant,
    paperUrl: row.paper_url,
    thresholds: Array.isArray(row.grade_thresholds) ? row.grade_thresholds : [],
    feedback: row.parent_overall_feedback,
    markedAt: row.marked_at,
    items: (itemRows ?? []).map((item) => {
      const question = questionById.get(item.question_template_id);
      return {
        questionId: item.question_template_id,
        sequence: item.sequence,
        marks: item.marks_available,
        kind: question?.question_type ?? "",
        prompt: question?.prompt_template ?? "",
        objective: question?.objective_id ? (labels.get(question.objective_id) ?? null) : null,
      };
    }),
  };
}

export type AssessmentFields = {
  title: string;
  category: string;
  routeId: string;
  scheduledDate: string | null;
  durationMinutes: number;
  thresholds: GradeThreshold[];
  paperCode: string | null;
  examSeries: string | null;
  paperVariant: string | null;
  paperUrl: string | null;
};

function fieldsToRow(fields: AssessmentFields) {
  return {
    title: fields.title,
    assessment_category: fields.category,
    entry_route_id: fields.routeId,
    scheduled_date: fields.scheduledDate,
    duration_minutes: fields.durationMinutes,
    grade_thresholds: fields.thresholds,
    paper_code: fields.paperCode,
    exam_series: fields.examSeries,
    paper_variant: fields.paperVariant,
    paper_url: fields.paperUrl,
  };
}

export async function createAssessment(termId: string, studentId: string, fields: AssessmentFields) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("term_assessments")
    .insert({ ...fieldsToRow(fields), academic_term_id: termId, student_id: studentId, total_marks: 0, status: "Draft" })
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  const id = data?.[0]?.id as string | undefined;
  return id ? { ok: true as const, id } : { ok: false as const, error: "Not saved. Sign in as the guardian and try again." };
}

export async function updateAssessment(id: string, fields: AssessmentFields) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.from("term_assessments").update(fieldsToRow(fields)).eq("id", id).select("id");
  if (error) return { ok: false as const, error: error.message };
  return data?.length ? { ok: true as const } : { ok: false as const, error: "Not saved. Sign in as the guardian and try again." };
}

export async function setAssessmentStatus(id: string, status: "Draft" | "Scheduled") {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.from("term_assessments").update({ status }).eq("id", id).select("id");
  if (error) return { ok: false as const, error: error.message };
  return data?.length ? { ok: true as const } : { ok: false as const, error: "Not saved." };
}

/**
 * Makes the assessment's questions exactly `items`, in order, and keeps
 * total_marks equal to their sum.
 */
export async function setAssessmentItems(id: string, items: Array<{ questionId: string; marks: number }>) {
  const supabase = await createServerClientInstance();
  const keep = items.map((item) => item.questionId);

  let removal = supabase.from("assessment_items").delete().eq("assessment_id", id);
  if (keep.length) removal = removal.not("question_template_id", "in", `(${keep.join(",")})`);
  const { error: removeError } = await removal;
  if (removeError) return { ok: false as const, error: removeError.message };

  if (items.length) {
    const { data, error } = await supabase
      .from("assessment_items")
      .upsert(
        items.map((item, index) => ({
          assessment_id: id,
          question_template_id: item.questionId,
          sequence: index,
          marks_available: item.marks,
        })),
        { onConflict: "assessment_id,question_template_id" },
      )
      .select("id");
    if (error) return { ok: false as const, error: error.message };
    if ((data ?? []).length !== items.length) return { ok: false as const, error: "Some questions were not added." };
  }

  const total = items.reduce((sum, item) => sum + item.marks, 0);
  const { error: totalError } = await supabase.from("term_assessments").update({ total_marks: total }).eq("id", id);
  return totalError ? { ok: false as const, error: totalError.message } : { ok: true as const, total };
}

/** Removes the assessment's not-yet-started items from the learner's days. */
export async function clearFromTimetable(id: string) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("day_plan_items").delete().eq("term_assessment_id", id).eq("status", "planned");
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function deleteAssessment(id: string) {
  const cleared = await clearFromTimetable(id);
  if (!cleared.ok) return cleared;

  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.from("term_assessments").delete().eq("id", id).select("id");
  if (error) return { ok: false as const, error: error.message };
  return data?.length ? { ok: true as const } : { ok: false as const, error: "Nothing was deleted." };
}

/**
 * Puts the assessment on the learner's day: one day_plan_items row for the
 * scheduled date (replacing any earlier planned one for this assessment), and
 * optionally an exam-day override when that date has no override yet.
 */
export async function placeOnTimetable(input: {
  assessmentId: string;
  householdId: string;
  studentId: string;
  date: string;
  title: string;
  minutes: number;
  pastPaper: boolean;
  examDay: boolean;
  createdBy: string | null;
}) {
  const supabase = await createServerClientInstance();

  const { error: clearError } = await supabase
    .from("day_plan_items")
    .delete()
    .eq("term_assessment_id", input.assessmentId)
    .eq("status", "planned");
  if (clearError) return { ok: false as const, error: clearError.message };

  const { error } = await supabase.from("day_plan_items").insert({
    household_id: input.householdId,
    student_id: input.studentId,
    plan_date: input.date,
    item_type: input.pastPaper ? "past_paper" : "assessment",
    term_assessment_id: input.assessmentId,
    title: input.title,
    planned_minutes: input.minutes,
    reasons: ["Set by the parent"],
  });
  if (error) return { ok: false as const, error: error.message };

  if (!input.examDay) return { ok: true as const, note: null };

  const { data: existing } = await supabase
    .from("timetable_overrides")
    .select("id, override_type")
    .eq("household_id", input.householdId)
    .eq("override_date", input.date)
    .maybeSingle();
  if (existing) {
    return { ok: true as const, note: `That date already has a ${String(existing.override_type).replace("_", " ")} set, so it was left as it is.` };
  }

  const { error: overrideError } = await supabase.from("timetable_overrides").insert({
    household_id: input.householdId,
    override_date: input.date,
    override_type: "exam_day",
    reason: input.title,
    created_by: input.createdBy,
  });
  return overrideError
    ? { ok: false as const, error: `Scheduled, but the exam day was not set: ${overrideError.message}` }
    : { ok: true as const, note: null };
}
