"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLearnerSession } from "@/lib/auth/learner-session";
import { answerCheckpoint, flagStuck, logLessonTime } from "@/lib/data/events";

/**
 * Learner study writes (Phase 4). They replace the old unauthenticated /api/learning-events
 * route: each runs on the learner's own session, and RLS plus answer_checkpoint() decide what
 * may be written.
 */

const code = z.string().trim().min(3).max(64);

export async function logLessonTimeAction(input: { objectiveCode: string; minutes: number }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = z.object({ objectiveCode: code, minutes: z.number().int().min(1).max(600) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That study time could not be read." };

  const result = await logLessonTime(guard.learnerId, parsed.data.objectiveCode, parsed.data.minutes);
  if (result.ok) revalidatePath("/today");
  return result;
}

export async function flagStuckAction(input: { objectiveCode: string }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = z.object({ objectiveCode: code }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That objective could not be read." };

  return flagStuck(guard.learnerId, parsed.data.objectiveCode);
}

export async function answerCheckpointAction(input: { questionId: string; option: string }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = z.object({ questionId: z.string().uuid(), option: z.string().trim().length(1) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pick an answer first." };

  return answerCheckpoint(parsed.data.questionId, parsed.data.option);
}
