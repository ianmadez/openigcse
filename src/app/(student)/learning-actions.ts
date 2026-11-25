"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLearnerSession } from "@/lib/auth/learner-session";
import { ERROR_TAG_VALUES } from "@/lib/assessment/marking";
import { answerCheckpoint, answerTriviaCheckpoint, flagStuck, logLessonTime } from "@/lib/data/events";
import { addCheckpointMistake, addTriviaMistake } from "@/lib/data/mistakes";
import { recordPendingReviews } from "@/lib/data/retention";
import { finishPlanItem, reorderPeriod, skipPlanItem, startPlanItem } from "@/lib/data/timetable";
import { SKIP_REASONS } from "@/lib/planning/today";

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

export async function answerCheckpointAction(input: { questionId: string; option: string; kind?: "recall" | "practice" }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = z
    .object({
      questionId: z.string().uuid(),
      option: z.string().trim().length(1),
      kind: z.enum(["recall", "practice"]).default("recall"),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pick an answer first." };

  const result = await answerCheckpoint(parsed.data.questionId, parsed.data.option, parsed.data.kind);
  if (result.ok) {
    // The answer wrote a scored event; fold it into the FSRS card now. A failure here leaves the
    // event in place, and the next /review open picks it up.
    await recordPendingReviews(guard.learnerId, 20).catch(() => null);
    revalidatePath("/today");
  }
  return result;
}

export async function answerTriviaCheckpointAction(input: { questionId: string; option: string }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = z.object({ questionId: z.string().uuid(), option: z.string().trim().length(1) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pick an answer first." };

  return answerTriviaCheckpoint(parsed.data.questionId, parsed.data.option);
}

const notebookInput = z.object({
  questionId: z.string().uuid(),
  option: z.string().trim().length(1),
  category: z.enum(ERROR_TAG_VALUES),
});

export async function addCheckpointMistakeAction(input: { questionId: string; option: string; category: string }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = notebookInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pick a category first." };

  const result = await addCheckpointMistake(guard.learnerId, {
    questionId: parsed.data.questionId,
    option: parsed.data.option,
    errorTag: parsed.data.category,
  });
  if (result.ok) {
    revalidatePath("/review");
    revalidatePath("/today");
  }
  return result;
}

export async function addTriviaMistakeAction(input: { questionId: string; option: string; category: string }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = notebookInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pick a category first." };

  const result = await addTriviaMistake(guard.learnerId, {
    questionId: parsed.data.questionId,
    option: parsed.data.option,
    errorTag: parsed.data.category,
  });
  if (result.ok) revalidatePath("/review");
  return result;
}

/* ---------------------------------------------------------------- the day (Step 4.1) */

const itemId = z.string().uuid("That is not a plan item.");

export async function startPlanItemAction(id: string) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = itemId.safeParse(id);
  if (!parsed.success) return { ok: false as const, error: "That is not a plan item." };
  const result = await startPlanItem(parsed.data);
  if (result.ok) revalidatePath("/today");
  return result;
}

export async function finishPlanItemAction(input: { id: string; minutes: number }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = z.object({ id: itemId, minutes: z.number().int().min(1).max(600) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That study time could not be read." };
  const result = await finishPlanItem(parsed.data.id, parsed.data.minutes);
  if (result.ok) revalidatePath("/today");
  return result;
}

export async function skipPlanItemAction(input: { id: string; reason: string }) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const reasons = SKIP_REASONS.map((reason) => reason.value) as [string, ...string[]];
  const parsed = z.object({ id: itemId, reason: z.enum(reasons) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pick a reason for skipping." };
  const result = await skipPlanItem(parsed.data.id, parsed.data.reason);
  if (result.ok) revalidatePath("/today");
  return result;
}

export async function reorderPeriodAction(moves: Array<{ id: string; sequence: number }>) {
  const guard = await requireLearnerSession();
  if (!guard.ok) return guard;
  const parsed = z.array(z.object({ id: itemId, sequence: z.number().int().min(0).max(10000) })).min(2).max(20).safeParse(moves);
  if (!parsed.success) return { ok: false as const, error: "That order could not be read." };
  const result = await reorderPeriod(guard.learnerId, parsed.data);
  if (result.ok) revalidatePath("/today");
  return result;
}
