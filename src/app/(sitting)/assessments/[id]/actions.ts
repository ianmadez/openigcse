"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLearnerSession } from "@/lib/auth/learner-session";
import { signedUrls, uploadHouseholdFile } from "@/lib/data/files";
import { saveResponses, startSitting, submitSitting, type SittingResponse } from "@/lib/data/sittings";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const responsesSchema = z
  .array(
    z.object({
      questionId: z.string().uuid(),
      selectedOption: z.enum(["A", "B", "C", "D"]).nullable(),
      answerText: z.string().max(20000),
      photoPaths: z.array(z.string().max(300)).max(6),
    }),
  )
  .max(60);

function ownPhotos(responses: SittingResponse[], householdId: string, learnerId: string) {
  const folder = `${householdId}/working/${learnerId}/`;
  return responses.every((response) => response.photoPaths.every((path) => path.startsWith(folder) && !path.includes("..")));
}

export async function startSittingAction(assessmentId: string): Promise<Result> {
  const learner = await requireLearnerSession();
  if (!learner.ok) return learner;
  if (!z.string().uuid().safeParse(assessmentId).success) return { ok: false, error: "That is not an assessment." };

  const started = await startSitting(learner.householdId, learner.learnerId, assessmentId);
  if (!started.ok) return { ok: false, error: `Could not start: ${started.error}` };
  revalidatePath(`/assessments/${assessmentId}`);
  return { ok: true };
}

export async function autosaveAction(input: unknown): Promise<Result<{ savedAt: string }>> {
  const learner = await requireLearnerSession();
  if (!learner.ok) return learner;

  const parsed = z.object({ assessmentId: z.string().uuid(), responses: responsesSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those answers could not be read." };
  if (!ownPhotos(parsed.data.responses, learner.householdId, learner.learnerId)) {
    return { ok: false, error: "A photo is not in your own folder." };
  }

  const saved = await saveResponses(learner.householdId, learner.learnerId, parsed.data.assessmentId, parsed.data.responses);
  return saved.ok ? { ok: true, savedAt: new Date().toISOString() } : saved;
}

/** Saves whatever is on screen, then hands the paper in. Safe to call twice. */
export async function submitSittingAction(input: unknown): Promise<Result<{ note: string | null }>> {
  const learner = await requireLearnerSession();
  if (!learner.ok) return learner;

  const parsed = z.object({ assessmentId: z.string().uuid(), responses: responsesSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those answers could not be read." };
  if (!ownPhotos(parsed.data.responses, learner.householdId, learner.learnerId)) {
    return { ok: false, error: "A photo is not in your own folder." };
  }

  const saved = await saveResponses(learner.householdId, learner.learnerId, parsed.data.assessmentId, parsed.data.responses);
  const submitted = await submitSitting(parsed.data.assessmentId, learner.learnerId);
  if (!submitted.ok) return { ok: false, error: `Not handed in: ${submitted.error}` };

  revalidatePath(`/assessments/${parsed.data.assessmentId}`);
  revalidatePath("/assessments");
  revalidatePath("/parent/marking-desk");
  return {
    ok: true,
    note: saved.ok ? null : "Handed in. The last few seconds of changes arrived after time was up, so the paper has your last saved answers.",
  };
}

export async function uploadWorkingAction(formData: FormData): Promise<Result<{ path: string; url: string }>> {
  const learner = await requireLearnerSession();
  if (!learner.ok) return learner;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a photo." };

  const uploaded = await uploadHouseholdFile(learner.householdId, "working", learner.learnerId, file);
  if (!uploaded.ok) return uploaded;
  const url = (await signedUrls([uploaded.path])).get(uploaded.path) ?? "";
  return { ok: true, path: uploaded.path, url };
}
