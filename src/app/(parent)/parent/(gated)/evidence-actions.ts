"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { reviewEvidence } from "@/lib/data/evidence";

const schema = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["Approved", "NeedsCorrection"]),
    feedback: z.string().trim().max(2000),
  })
  .refine((value) => value.decision === "Approved" || value.feedback.length > 0, {
    message: "Say what needs changing so the learner knows what to fix.",
  });

export async function reviewEvidenceAction(input: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the review." };

  const saved = await reviewEvidence(parsed.data.id, parsed.data.decision, parsed.data.feedback || null, guard.session.profileId);
  if (!saved.ok) return saved;

  revalidatePath("/parent");
  revalidatePath("/evidence");
  return { ok: true, message: parsed.data.decision === "Approved" ? "Approved." : "Sent back with your notes." };
}
