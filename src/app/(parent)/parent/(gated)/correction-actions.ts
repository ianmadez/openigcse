"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { approveCorrection } from "@/lib/data/mistakes";

/** Accepts a learner's written correction, which resolves the mistake (Step 4.3). */
export async function approveCorrectionAction(id: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "That is not a mistake id." };

  const saved = await approveCorrection(parsed.data);
  if (!saved.ok) return saved;

  revalidatePath("/parent");
  revalidatePath("/review");
  return { ok: true, message: "Approved. The mistake is resolved." };
}
