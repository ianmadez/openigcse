"use server";

import { revalidatePath } from "next/cache";

import { checkEvidence } from "@/lib/assessment/evidence";
import { requireLearnerSession } from "@/lib/auth/learner-session";
import { createEvidence } from "@/lib/data/evidence";
import { removeHouseholdFiles, uploadHouseholdFile } from "@/lib/data/files";

const UUID = /^[0-9a-f-]{36}$/i;

export async function submitEvidenceAction(
  _previous: { ok: boolean; message?: string; error?: string } | null,
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const learner = await requireLearnerSession();
  if (!learner.ok) return learner;

  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const typedResponse = String(formData.get("typedResponse") ?? "").slice(0, 20000);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);
  const objectiveId = String(formData.get("objectiveId") ?? "");
  const previousId = String(formData.get("previousId") ?? "");
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  const check = checkEvidence({ title, typedResponse, hasFile });
  if (!check.ok) return check;

  let uploaded: { path: string; mimeType: string; size: number } | null = null;
  if (hasFile) {
    const result = await uploadHouseholdFile(learner.householdId, "evidence", learner.learnerId, file as File);
    if (!result.ok) return result;
    uploaded = result;
  }

  const saved = await createEvidence({
    householdId: learner.householdId,
    learnerId: learner.learnerId,
    title,
    objectiveId: UUID.test(objectiveId) ? objectiveId : null,
    typedResponse: typedResponse.trim() || null,
    notes: notes || null,
    filePath: uploaded?.path ?? null,
    mimeType: uploaded?.mimeType ?? null,
    byteSize: uploaded?.size ?? null,
    previousId: UUID.test(previousId) ? previousId : null,
  });

  if (!saved.ok) {
    // Do not leave an orphaned file behind a refused row.
    if (uploaded) await removeHouseholdFiles([uploaded.path]);
    return { ok: false, error: `Not sent: ${saved.error}` };
  }

  revalidatePath("/evidence");
  revalidatePath("/parent");
  return { ok: true, message: "Sent for review." };
}
