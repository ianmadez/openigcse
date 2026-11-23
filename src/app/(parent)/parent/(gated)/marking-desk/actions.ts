"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { validateMarks } from "@/lib/assessment/scoring";
import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { getMarkingSheet, saveMarks } from "@/lib/data/marking";

const TAGS = ["ConceptGap", "CommandWordMisread", "CalculationSlip", "IncompleteExplanation", "TimePressure"] as const;

const schema = z.object({
  assessmentId: z.string().uuid(),
  feedback: z.string().max(2000),
  marks: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        awarded: z.number().nullable(),
        errorCategory: z.enum(TAGS).nullable(),
        feedback: z.string().max(1000),
      }),
    )
    .min(1)
    .max(60),
});

export type SaveMarksResult =
  | { ok: true; message: string }
  | { ok: false; error: string; questionId?: string };

export async function saveMarksAction(input: unknown): Promise<SaveMarksResult> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those marks could not be read." };

  // Re-read the paper so the available marks come from Postgres, not the form.
  const sheet = await getMarkingSheet(parsed.data.assessmentId, guard.session.learnerId);
  if (!sheet) return { ok: false, error: "That assessment is not in this household." };

  const available = new Map(sheet.items.map((item) => [item.questionId, item.available]));
  if (parsed.data.marks.length !== sheet.items.length || parsed.data.marks.some((mark) => !available.has(mark.questionId))) {
    return { ok: false, error: "The paper changed while you were marking. Reload and mark again." };
  }

  const checked = validateMarks(
    parsed.data.marks.map((mark) => ({ ...mark, available: available.get(mark.questionId)! })),
  );
  if (!checked.ok) return checked;

  const saved = await saveMarks({
    assessmentId: parsed.data.assessmentId,
    studentId: sheet.studentId,
    feedback: parsed.data.feedback.trim(),
    marks: parsed.data.marks.map((mark) => ({
      questionId: mark.questionId,
      awarded: mark.awarded!,
      // A reason only means something on a dropped mark.
      errorCategory: mark.awarded! < available.get(mark.questionId)! ? mark.errorCategory : null,
      feedback: mark.feedback.trim(),
    })),
  });
  if (!saved.ok) return { ok: false, error: `Not saved: ${saved.error}` };

  for (const path of ["/parent/marking-desk", "/parent/assessments", "/review", "/assessments", "/progress", "/parent/progress", "/today"]) {
    revalidatePath(path);
  }
  revalidatePath(`/assessments/${parsed.data.assessmentId}`);

  return {
    ok: true,
    message: `Marked: ${saved.awarded} of ${saved.available}. ${
      saved.mistakes === 0 ? "No mistakes to log." : `${saved.mistakes} ${saved.mistakes === 1 ? "mistake" : "mistakes"} in the learner's notebook.`
    }`,
  };
}
