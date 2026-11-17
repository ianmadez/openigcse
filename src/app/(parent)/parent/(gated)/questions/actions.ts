"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { questionInputSchema, toQuestionRow } from "@/lib/assessment/question";
import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { removeHouseholdFiles, signedUrls, uploadHouseholdFile } from "@/lib/data/files";
import { describeObjectives, getAssessmentObjectives } from "@/lib/data/objectives";
import { deleteQuestion, saveQuestion } from "@/lib/data/question-bank";

type Result<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

export async function saveQuestionAction(input: unknown): Promise<Result<{ id: string }>> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const { householdId, profileId } = guard.session;

  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the question." };

  const objective = (await describeObjectives([parsed.data.objectiveId])).get(parsed.data.objectiveId);
  if (!objective) return { ok: false, error: "That objective is not in an imported syllabus." };

  if (parsed.data.assessmentObjectiveId) {
    const aos = await getAssessmentObjectives([objective.versionId]);
    if (!aos.some((ao) => ao.id === parsed.data.assessmentObjectiveId)) {
      return { ok: false, error: "That assessment objective belongs to a different syllabus." };
    }
  }

  const built = toQuestionRow(parsed.data, householdId);
  if (!built.ok) return built;

  const saved = await saveQuestion(
    parsed.data.id ? built.row : { ...built.row, created_by: profileId },
    parsed.data.id,
  );
  if (!saved.ok) return saved;

  revalidatePath("/parent/questions");
  return { ok: true, id: saved.id, message: "Question saved." };
}

export async function deleteQuestionAction(id: string): Promise<Result> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "That is not a question id." };

  const deleted = await deleteQuestion(parsed.data);
  if (!deleted.ok) return deleted;

  // The row is gone; a leftover image is only storage, so its failure is not the parent's problem.
  await removeHouseholdFiles(deleted.imagePaths);

  revalidatePath("/parent/questions");
  return { ok: true, message: "Question deleted." };
}

export async function uploadQuestionImageAction(formData: FormData): Promise<Result<{ path: string; url: string }>> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const { householdId, profileId } = guard.session;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Question diagrams must be JPEG, PNG or WebP." };

  const uploaded = await uploadHouseholdFile(householdId, "questions", profileId ?? "guardian", file);
  if (!uploaded.ok) return uploaded;

  const url = (await signedUrls([uploaded.path])).get(uploaded.path) ?? "";
  return { ok: true, path: uploaded.path, url };
}
