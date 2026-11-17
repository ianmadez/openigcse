"use server";

import { revalidatePath } from "next/cache";

import { resolveMistake } from "@/lib/data/mistakes";

/**
 * Marks one mistake fixed on the learner's own session.
 *
 * RLS decides whether the row belongs to this learner, so a forged id fails in
 * Postgres rather than being trusted here.
 */
export async function resolveMistakeAction(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false as const, error: "That is not a mistake id." };
  }

  const result = await resolveMistake(id);
  if (result.ok) revalidatePath("/review");

  return result;
}
