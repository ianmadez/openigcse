import { sittingState, type SittingState } from "@/lib/assessment/builder";
import { toSittingQuestion, type SittingQuestion } from "@/lib/assessment/sitting";
import { signedUrls } from "@/lib/data/files";
import { createServerClientInstance } from "@/lib/supabase/server";

export type SittingResponse = {
  questionId: string;
  selectedOption: string | null;
  answerText: string;
  photoPaths: string[];
};

export type SittingView = {
  assessmentId: string;
  title: string;
  category: string;
  status: string;
  state: SittingState;
  durationMinutes: number;
  /** Minutes added by approved "more time" requests, already included in durationMinutes. */
  extraMinutes: number;
  totalMarks: number;
  paperUrl: string | null;
  sitting: { id: string; startedAt: string; submittedAt: string | null } | null;
  questions: SittingQuestion[];
  responses: SittingResponse[];
  imageUrls: Record<string, string>;
  result: {
    score: number | null;
    feedback: string | null;
    marks: Record<string, { awarded: number; feedback: string | null }>;
  } | null;
};

/**
 * One assessment as the learner sees it. Questions are only sent once a
 * sitting has started (or the paper is marked), and never with an answer key.
 */
export async function getSittingView(assessmentId: string, learnerId: string, now: Date = new Date()): Promise<SittingView | null> {
  const supabase = await createServerClientInstance();
  const { data: assessment } = await supabase
    .from("term_assessments")
    .select("id, title, assessment_category, status, duration_minutes, total_marks, paper_url, student_id, student_score, parent_overall_feedback")
    .eq("id", assessmentId)
    .maybeSingle();

  if (!assessment || assessment.status === "Draft") return null;
  if (assessment.student_id && assessment.student_id !== learnerId) return null;

  const { data: sittingRow } = await supabase
    .from("assessment_sittings")
    .select("id, started_at, submitted_at, extra_minutes")
    .eq("assessment_id", assessmentId)
    .eq("student_id", learnerId)
    .maybeSingle();
  const sitting = sittingRow ? { id: sittingRow.id, startedAt: sittingRow.started_at, submittedAt: sittingRow.submitted_at } : null;
  // Approved "more time" requests (Step 5.1) lengthen this sitting only.
  const durationMinutes = assessment.duration_minutes + Number(sittingRow?.extra_minutes ?? 0);
  const state = sittingState({ status: assessment.status ?? "Scheduled", durationMinutes, sitting }, now);

  const base = {
    assessmentId: assessment.id,
    title: assessment.title,
    category: assessment.assessment_category,
    status: assessment.status ?? "Scheduled",
    state,
    durationMinutes,
    extraMinutes: Number(sittingRow?.extra_minutes ?? 0),
    totalMarks: assessment.total_marks,
    paperUrl: assessment.paper_url,
    sitting,
  };

  if (!sitting && state !== "marked") {
    return { ...base, questions: [], responses: [], imageUrls: {}, result: null };
  }

  const { data: items } = await supabase
    .from("assessment_items")
    .select("question_template_id, sequence, marks_available")
    .eq("assessment_id", assessmentId)
    .order("sequence", { ascending: true });
  const ids = (items ?? []).map((item) => item.question_template_id as string);

  const [{ data: rows }, { data: responses }, { data: marks }] = await Promise.all([
    ids.length
      ? supabase.from("learner_questions").select("id, question_type, prompt_template, options_schema, parts, image_paths").in("id", ids)
      : Promise.resolve({ data: [] }),
    supabase
      .from("assessment_responses")
      .select("question_template_id, selected_option, answer_text, photo_paths")
      .eq("assessment_id", assessmentId)
      .eq("student_id", learnerId),
    state === "marked"
      ? supabase.from("assessment_item_marks").select("question_template_id, marks_awarded, feedback").eq("assessment_id", assessmentId)
      : Promise.resolve({ data: [] }),
  ]);

  const rowById = new Map((rows ?? []).map((row) => [row.id, row]));
  const questions = (items ?? []).flatMap((item, index) => {
    const row = rowById.get(item.question_template_id);
    return row ? [toSittingQuestion(row, index + 1, item.marks_available)] : [];
  });

  const learnerResponses: SittingResponse[] = (responses ?? []).map((row) => ({
    questionId: row.question_template_id,
    selectedOption: row.selected_option,
    answerText: row.answer_text ?? "",
    photoPaths: row.photo_paths ?? [],
  }));

  const urls = await signedUrls([
    ...questions.flatMap((question) => question.imagePaths),
    ...learnerResponses.flatMap((response) => response.photoPaths),
  ]);

  return {
    ...base,
    questions,
    responses: learnerResponses,
    imageUrls: Object.fromEntries(urls),
    result:
      state === "marked"
        ? {
            score: assessment.student_score === null ? null : Number(assessment.student_score),
            feedback: assessment.parent_overall_feedback,
            marks: Object.fromEntries(
              (marks ?? []).map((mark) => [mark.question_template_id, { awarded: Number(mark.marks_awarded), feedback: mark.feedback }]),
            ),
          }
        : null,
  };
}

/** Starts the clock, or returns the sitting that already exists. The database sets the start time. */
export async function startSitting(householdId: string, learnerId: string, assessmentId: string) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase
    .from("assessment_sittings")
    .insert({ household_id: householdId, student_id: learnerId, assessment_id: assessmentId });

  // 23505: a sitting already exists (another tab or device started it), which is fine.
  if (error && error.code !== "23505") return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function saveResponses(
  householdId: string,
  learnerId: string,
  assessmentId: string,
  responses: SittingResponse[],
) {
  if (responses.length === 0) return { ok: true as const };
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("assessment_responses")
    .upsert(
      responses.map((response) => ({
        household_id: householdId,
        student_id: learnerId,
        assessment_id: assessmentId,
        question_template_id: response.questionId,
        selected_option: response.selectedOption,
        answer_text: response.answerText || null,
        photo_paths: response.photoPaths,
      })),
      { onConflict: "assessment_id,student_id,question_template_id" },
    )
    .select("id");

  if (error) {
    return {
      ok: false as const,
      error: /row-level security/i.test(error.message) ? "Time is up or the paper was handed in, so answers can no longer change." : error.message,
    };
  }
  if ((data ?? []).length !== responses.length) return { ok: false as const, error: "Some answers were not saved." };
  return { ok: true as const };
}

export async function submitSitting(assessmentId: string, learnerId: string) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("assessment_sittings")
    .update({ submitted_at: new Date().toISOString() })
    .eq("assessment_id", assessmentId)
    .eq("student_id", learnerId)
    .is("submitted_at", null)
    .select("submitted_at");

  if (error) return { ok: false as const, error: error.message };
  // No row updated means it was already handed in, which is the outcome we wanted.
  return { ok: true as const, alreadySubmitted: !data?.length };
}

/** The database's own answer (duration plus grace), so app and RLS never disagree. */
export async function sittingIsOpen(assessmentId: string, learnerId: string) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("sitting_is_open", { p_assessment_id: assessmentId, p_student_id: learnerId });
  // If the question cannot be answered, assume open: refusing a hand-in is recoverable, losing answers is not.
  return error ? true : Boolean(data);
}
