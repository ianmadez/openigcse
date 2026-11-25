"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { deleteTriviaModule, saveTriviaModule } from "@/lib/data/trivia";
import { triviaModuleInputSchema } from "@/lib/trivia/module";

/** Step 4.2: a parent authors a documentary module and its timestamped checkpoints. */

function revalidateTrivia() {
  revalidatePath("/parent/trivia");
  revalidatePath("/parent/marking-desk");
  revalidatePath("/trivia");
}

export async function saveTriviaModuleAction(
  input: unknown,
): Promise<{ ok: true; id: string; message: string } | { ok: false; error: string }> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = triviaModuleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the module." };

  const saved = await saveTriviaModule(guard.session.householdId, guard.session.profileId, parsed.data);
  if (!saved.ok) return saved;

  revalidateTrivia();
  return { ok: true, id: saved.id, message: "Module saved." };
}

export async function deleteTriviaModuleAction(id: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "That is not a module id." };

  const deleted = await deleteTriviaModule(parsed.data);
  if (!deleted.ok) return deleted;

  revalidateTrivia();
  return { ok: true, message: "Module deleted." };
}
