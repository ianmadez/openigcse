import { initialMarks, type SheetMark } from "@/lib/assessment/marking";
import type { GradeThreshold } from "@/lib/assessment/scoring";
import { getAssessmentDetail, listAssessments, type AssessmentSummary } from "@/lib/data/assessment-builder";
import { signedUrls } from "@/lib/data/files";
import type { ErrorTag } from "@/lib/data/mistakes";
import { createServerClientInstance } from "@/lib/supabase/server";

/** Papers waiting for marks first, then recently marked ones that can be re-opened. */
export async function getMarkingQueue(termIds: string[]) {
  const all = await listAssessments(termIds);
  return {
    toMark: all.filter((assessment) => assessment.state === "handed_in"),
    marked: all.filter((assessment) => assessment.state === "marked").slice(0, 10),
  };
}

export type SheetItem = {
  questionId: string;
  number: number;
  kind: string;
  available: number;
  prompt: string;
  parts: Array<{ label: string; prompt: string; marks: number }>;
  options: Array<{ letter: string; text: string }>;
  correctOption: string | null;
  modelAnswer: string | null;
  markScheme: string;
  objectiveCode: string | null;
  selectedOption: string | null;
  answerText: string | null;
  photoPaths: string[];
  imagePaths: string[];
};

export type MarkingSheet = {
  assessment: AssessmentSummary & { thresholds: GradeThreshold[]; feedback: string | null; paperUrl: string | null };
  studentId: string;
  sat: boolean;
  items: SheetItem[];
  marks: Record<string, SheetMark>;
  urls: Record<string, string>;
};

export async function getMarkingSheet(assessmentId: string, fallbackLearnerId: string): Promise<MarkingSheet | null> {
  const detail = await getAssessmentDetail(assessmentId);
  if (!detail) return null;

  const studentId = detail.studentId ?? fallbackLearnerId;
  const supabase = await createServerClientInstance();
  const ids = detail.items.map((item) => item.questionId);

  const [{ data: questions }, { data: responses }, { data: saved }, { data: mistakes }] = await Promise.all([
    ids.length
      ? supabase
          .from("question_templates")
          .select("id, question_type, prompt_template, parts, options_schema, model_answer, mark_scheme_rubric, image_paths")
          .in("id", ids)
      : Promise.resolve({ data: [] }),
    supabase
      .from("assessment_responses")
      .select("question_template_id, selected_option, answer_text, photo_paths")
      .eq("assessment_id", assessmentId)
      .eq("student_id", studentId),
    supabase.from("assessment_item_marks").select("question_template_id, marks_awarded, feedback").eq("assessment_id", assessmentId),
    supabase
      .from("mistake_notebook")
      .select("question_template_id, error_category")
      .eq("term_assessment_id", assessmentId)
      .eq("student_id", studentId),
  ]);

  const questionById = new Map((questions ?? []).map((question) => [question.id, question]));
  const responseById = new Map((responses ?? []).map((response) => [response.question_template_id, response]));

  const items: SheetItem[] = detail.items.flatMap((item, index) => {
    const question = questionById.get(item.questionId);
    if (!question) return [];
    const response = responseById.get(item.questionId);
    const options = Array.isArray(question.options_schema)
      ? (question.options_schema as Array<{ letter: string; text: string; correct?: boolean }>)
      : [];
    return [
      {
        questionId: item.questionId,
        number: index + 1,
        kind: question.question_type,
        available: item.marks,
        prompt: question.prompt_template,
        parts: Array.isArray(question.parts) ? question.parts : [],
        options: options.map(({ letter, text }) => ({ letter, text })),
        correctOption: options.find((option) => option.correct)?.letter ?? null,
        modelAnswer: question.model_answer,
        markScheme: question.mark_scheme_rubric,
        objectiveCode: item.objective?.code ?? null,
        selectedOption: response?.selected_option ?? null,
        answerText: response?.answer_text ?? null,
        photoPaths: response?.photo_paths ?? [],
        imagePaths: question.image_paths ?? [],
      },
    ];
  });

  const marks = initialMarks(
    items,
    new Map((saved ?? []).map((mark) => [mark.question_template_id, { awarded: Number(mark.marks_awarded), feedback: mark.feedback }])),
    new Map(
      (mistakes ?? [])
        .filter((mistake) => mistake.question_template_id)
        .map((mistake) => [mistake.question_template_id as string, mistake.error_category as ErrorTag]),
    ),
  );

  const urls = await signedUrls(items.flatMap((item) => [...item.photoPaths, ...item.imagePaths]));

  return {
    assessment: { ...detail, thresholds: detail.thresholds, feedback: detail.feedback, paperUrl: detail.paperUrl },
    studentId,
    sat: Boolean(detail.sitting),
    items,
    marks,
    urls: Object.fromEntries(urls),
  };
}

export async function saveMarks(input: {
  assessmentId: string;
  studentId: string;
  marks: Array<{ questionId: string; awarded: number; errorCategory: ErrorTag | null; feedback: string }>;
  feedback: string;
}) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("save_assessment_marks", {
    p_assessment_id: input.assessmentId,
    p_student_id: input.studentId,
    p_marks: input.marks,
    p_feedback: input.feedback,
  });

  if (error) return { ok: false as const, error: error.message };
  const result = data as { awarded: number; available: number; mistakes: number };
  return { ok: true as const, ...result };
}
