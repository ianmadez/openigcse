"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLearnerSession } from "@/lib/auth/learner-session";
import { resolveMistake } from "@/lib/data/mistakes";

const attemptSchema = z.object({
  id: z.string().uuid("That is not a mistake id."),
  option: z.string().trim().max(1).optional(),
  correction: z.string().trim().max(2000).optional(),
});

/**
 * Tries to close a mistake: a retry of its question, or a written correction for a parent to
 * approve. resolve_mistake() in Postgres decides whether the retry is right.
 */
export async function resolveMistakeAction(input: { id: string; option?: string; correction?: string }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;

  const parsed = attemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the answer." };

  const result = await resolveMistake(parsed.data.id, parsed.data);
  if (result.ok) revalidatePath("/review");
  return result;
}
