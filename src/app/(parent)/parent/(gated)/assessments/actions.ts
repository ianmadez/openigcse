"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ASSESSMENT_KINDS, parseThresholds } from "@/lib/assessment/builder";
import { toQuestionRow } from "@/lib/assessment/question";
import { pickWeakest } from "@/lib/assessment/scoring";
import { requireGuardianSession } from "@/lib/auth/guardian-session";
import {
  clearFromTimetable,
  createAssessment,
  deleteAssessment,
  getAssessmentDetail,
  placeOnTimetable,
  setAssessmentItems,
  setAssessmentStatus,
  updateAssessment,
  type AssessmentDetail,
  type AssessmentFields,
} from "@/lib/data/assessment-builder";
import { getEnrollments } from "@/lib/data/enrollments";
import { getObjectiveRatios } from "@/lib/data/events";
import { describeObjectives } from "@/lib/data/objectives";
import { listQuestions, saveQuestion } from "@/lib/data/question-bank";

type Result<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

const PATHS = ["/parent/assessments", "/parent/marking-desk", "/assessments", "/today", "/parent/timetable"];
const refresh = (id?: string) => {
  PATHS.forEach((path) => revalidatePath(path));
  if (id) revalidatePath(`/parent/assessments/${id}`);
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const fieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the assessment a title.").max(120),
  category: z.enum(ASSESSMENT_KINDS.map((kind) => kind.value) as [string, ...string[]]),
  routeId: z.string().uuid("Choose a subject."),
  scheduledDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).transform((value) => value || null),
  durationMinutes: z.number().int().min(5, "At least 5 minutes.").max(300, "At most 300 minutes."),
  thresholds: z.array(z.object({ grade: z.string().max(4), minPercent: z.number().nullable() })).max(12),
  paperCode: optionalText(20),
  examSeries: optionalText(40),
  paperVariant: optionalText(10),
  paperUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https:\/\//.test(value), "The paper link must start with https://")
    .transform((value) => value || null),
});

async function checkFields(input: unknown, learnerId: string, termId: string): Promise<Result<{ fields: AssessmentFields }>> {
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };

  const thresholds = parseThresholds(parsed.data.thresholds);
  if (!thresholds.ok) return thresholds;

  const enrolled = await getEnrollments(learnerId, termId);
  if (!enrolled.some((enrollment) => enrollment.routeId === parsed.data.routeId)) {
    return { ok: false, error: "That subject is not one the learner is enrolled in this term." };
  }

  return { ok: true, fields: { ...parsed.data, thresholds: thresholds.thresholds } };
}

/** Editing is only safe before anyone has started the paper. */
function locked(detail: AssessmentDetail) {
  if (detail.state === "marked") return "This assessment is marked. Its questions can no longer change.";
  if (detail.sitting) return "The learner has started this assessment, so it can no longer be edited.";
  return null;
}

export async function createAssessmentAction(input: unknown): Promise<Result<{ id: string }>> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const { learnerId, activeTermId } = guard.session;
  if (!activeTermId) return { ok: false, error: "No term is running. Add one in the term planner." };

  const checked = await checkFields(input, learnerId, activeTermId);
  if (!checked.ok) return checked;

  const created = await createAssessment(activeTermId, learnerId, checked.fields);
  if (!created.ok) return created;
  refresh();
  return { ok: true, id: created.id };
}

const saveSchema = z.object({
  id: z.string().uuid(),
  fields: z.unknown(),
  questionIds: z.array(z.string().uuid()).max(60),
});

export async function saveAssessmentAction(input: unknown): Promise<Result<{ total: number }>> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const { learnerId } = guard.session;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an assessment." };
  if (new Set(parsed.data.questionIds).size !== parsed.data.questionIds.length) {
    return { ok: false, error: "A question is on the paper twice." };
  }

  const detail = await getAssessmentDetail(parsed.data.id);
  if (!detail) return { ok: false, error: "That assessment is not in this household." };
  const lock = locked(detail);
  if (lock) return { ok: false, error: lock };

  const checked = await checkFields(parsed.data.fields, learnerId, detail.termId);
  if (!checked.ok) return checked;

  // Marks come from the bank, never from the form, and every question must be on this subject.
  const bank = await listQuestions(guard.session.householdId);
  const byId = new Map(bank.map((question) => [question.id, question]));
  const items: Array<{ questionId: string; marks: number }> = [];
  const subject = (await getEnrollments(learnerId, detail.termId)).find((row) => row.routeId === checked.fields.routeId);
  for (const questionId of parsed.data.questionIds) {
    const question = byId.get(questionId);
    if (!question) return { ok: false, error: "One of the questions is not in the bank any more." };
    if (subject && question.objective?.subjectCode !== subject.subjectCode) {
      return { ok: false, error: "Every question must belong to the assessment's subject." };
    }
    items.push({ questionId, marks: question.marks });
  }

  const updated = await updateAssessment(detail.id, checked.fields);
  if (!updated.ok) return updated;
  const saved = await setAssessmentItems(detail.id, items);
  if (!saved.ok) return { ok: false, error: `Details saved, but the questions were not: ${saved.error}` };

  if (detail.status === "Scheduled" && items.length === 0) await setAssessmentStatus(detail.id, "Draft");

  refresh(detail.id);
  return { ok: true, total: saved.total, message: `Saved. ${items.length} ${items.length === 1 ? "question" : "questions"}, ${saved.total} ${saved.total === 1 ? "mark" : "marks"}.` };
}

/** Up to ten bank questions on the learner's weakest objectives for this subject, not already chosen. */
export async function autoPickAction(input: unknown): Promise<Result<{ questionIds: string[] }>> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = z.object({ subjectCode: z.string().max(10), exclude: z.array(z.string().uuid()).max(60) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a subject first." };

  const [bank, ratios] = await Promise.all([
    listQuestions(guard.session.householdId, { subject: parsed.data.subjectCode }),
    getObjectiveRatios(guard.session.learnerId),
  ]);
  const exclude = new Set(parsed.data.exclude);
  const candidates = bank
    .filter((question) => !exclude.has(question.id))
    .map((question) => ({ id: question.id, objectiveId: question.objective?.id ?? null }))
    .reverse(); // oldest first, so ties favour long-standing questions

  const questionIds = pickWeakest(candidates, ratios, 10);
  if (questionIds.length === 0) return { ok: false, error: "The bank has no more questions for this subject." };
  return { ok: true, questionIds, message: `Added ${questionIds.length} from the weakest objectives. Save to keep them.` };
}

const pastPaperSchema = z.object({
  id: z.string().uuid(),
  rows: z
    .array(z.object({ number: z.string().trim().min(1).max(10), marks: z.number().int().min(1).max(50), objectiveId: z.string().uuid() }))
    .min(1)
    .max(60),
});

/**
 * Past-paper questions become bank questions that point at the paper: the
 * paper itself stays a PDF link, so the prompt names the question number
 * rather than copying Cambridge's text.
 */
export async function addPastPaperQuestionsAction(input: unknown): Promise<Result<{ questionIds: string[] }>> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = pastPaperSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the question rows." };

  const detail = await getAssessmentDetail(parsed.data.id);
  if (!detail) return { ok: false, error: "That assessment is not in this household." };
  const lock = locked(detail);
  if (lock) return { ok: false, error: lock };
  if (!detail.paperCode) return { ok: false, error: "Save the paper code first, for example 0625/42." };

  const labels = await describeObjectives(parsed.data.rows.map((row) => row.objectiveId));
  const paper = [detail.paperCode, detail.examSeries, detail.paperVariant ? `variant ${detail.paperVariant}` : null]
    .filter(Boolean)
    .join(" ");

  const questionIds: string[] = [];
  for (const row of parsed.data.rows) {
    if (labels.get(row.objectiveId)?.subjectCode !== detail.subjectCode) {
      return { ok: false, error: `Question ${row.number}: tag an objective from ${detail.subjectCode}.` };
    }
    const built = toQuestionRow(
      {
        kind: "Structured",
        objectiveId: row.objectiveId,
        assessmentObjectiveId: null,
        tier: "Both",
        difficulty: "ExamLevel",
        prompt: `${paper}, question ${row.number}. Answer it on the paper.`,
        options: [],
        correctOption: null,
        parts: [{ label: row.number, prompt: `Question ${row.number} on the paper`, marks: row.marks }],
        marks: row.marks,
        modelAnswer: "",
        markScheme: `Mark with the published ${detail.paperCode} mark scheme.`,
        imagePaths: [],
      },
      guard.session.householdId,
    );
    if (!built.ok) return built;
    const saved = await saveQuestion({ ...built.row, created_by: guard.session.profileId });
    if (!saved.ok) return { ok: false, error: `Question ${row.number}: ${saved.error}` };
    questionIds.push(saved.id);
  }

  return { ok: true, questionIds, message: `Created ${questionIds.length} paper ${questionIds.length === 1 ? "question" : "questions"}. Save to put them on the paper.` };
}

export async function publishAssessmentAction(input: unknown): Promise<Result> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = z.object({ id: z.string().uuid(), examDay: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an assessment." };

  const detail = await getAssessmentDetail(parsed.data.id);
  if (!detail) return { ok: false, error: "That assessment is not in this household." };
  if (detail.state !== "draft" && detail.state !== "scheduled") return { ok: false, error: "This assessment has already been sat." };
  if (detail.items.length === 0) return { ok: false, error: "Add at least one question and save before scheduling." };
  if (!detail.scheduledDate) return { ok: false, error: "Pick a date and save before scheduling." };

  const status = await setAssessmentStatus(detail.id, "Scheduled");
  if (!status.ok) return status;

  const placed = await placeOnTimetable({
    assessmentId: detail.id,
    householdId: guard.session.householdId,
    studentId: detail.studentId ?? guard.session.learnerId,
    date: detail.scheduledDate,
    title: detail.title,
    minutes: detail.durationMinutes,
    pastPaper: detail.category === "TimedPastPaper",
    examDay: parsed.data.examDay,
    createdBy: guard.session.profileId,
  });
  refresh(detail.id);
  if (!placed.ok) return { ok: false, error: `Scheduled, but not placed on the day: ${placed.error}` };
  return { ok: true, message: placed.note ?? "Scheduled. The learner can sit it and it is on that day's plan." };
}

export async function unpublishAssessmentAction(id: string): Promise<Result> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const detail = z.string().uuid().safeParse(id).success ? await getAssessmentDetail(id) : null;
  if (!detail) return { ok: false, error: "That assessment is not in this household." };
  const lock = locked(detail);
  if (lock) return { ok: false, error: lock };

  const status = await setAssessmentStatus(detail.id, "Draft");
  if (status.ok) {
    const cleared = await clearFromTimetable(detail.id);
    if (!cleared.ok) return { ok: false, error: `Back to draft, but it is still on the day plan: ${cleared.error}` };
  }
  refresh(detail.id);
  return status.ok ? { ok: true, message: "Back to draft and off the day plan. An exam day set on the timetable stays until you remove it there." } : status;
}

export async function deleteAssessmentAction(id: string): Promise<Result> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const detail = z.string().uuid().safeParse(id).success ? await getAssessmentDetail(id) : null;
  if (!detail) return { ok: false, error: "That assessment is not in this household." };
  const lock = locked(detail);
  if (lock) return { ok: false, error: lock };

  const deleted = await deleteAssessment(detail.id);
  refresh();
  return deleted.ok ? { ok: true, message: "Deleted." } : deleted;
}
