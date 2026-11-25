"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { requireLearnerSession } from "@/lib/auth/learner-session";
import { getAuthContext } from "@/lib/auth/session";
import { todayIso } from "@/lib/data/dates";
import { createRequest } from "@/lib/data/requests";
import { getSetupState } from "@/lib/data/session";
import { getDayPlanItems } from "@/lib/data/timetable";
import { REQUEST_TYPES } from "@/lib/requests/catalog";
import { pushPending } from "@/lib/push/notify";

/**
 * The learner raises a typed ask (Step 5.1). RLS only lets a learner insert a pending row for
 * itself, so the guard here is the one lookup that names the learner, not a full setup read.
 */
export async function raiseRequestAction(input: {
  type: string;
  note?: string;
  dayPlanItemId?: string | null;
  withItemId?: string | null;
  termAssessmentId?: string | null;
  minutes?: number;
}) {
  const parsed = z
    .object({
      type: z.enum(REQUEST_TYPES),
      note: z.string().trim().max(300).optional(),
      dayPlanItemId: z.string().uuid().nullish(),
      withItemId: z.string().uuid().nullish(),
      termAssessmentId: z.string().uuid().nullish(),
      minutes: z.number().int().min(5).max(60).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That request could not be read." };
  const data = parsed.data;

  if (data.type === "swap" && (!data.dayPlanItemId || !data.withItemId || data.dayPlanItemId === data.withItemId)) {
    return { ok: false as const, error: "Pick two different periods to swap." };
  }
  if (data.type === "more_time" && !data.termAssessmentId) {
    return { ok: false as const, error: "More time is asked from inside a test." };
  }

  const context = await getAuthContext();
  if (!context?.profileId || !context.householdId || context.role !== "student") {
    return { ok: false as const, error: "Only the learner's own signed-in device can ask." };
  }

  const result = await createRequest(context.householdId, context.profileId, {
    type: data.type,
    note: data.note,
    dayPlanItemId: data.dayPlanItemId ?? null,
    termAssessmentId: data.termAssessmentId ?? null,
    payload: {
      ...(data.withItemId ? { withItemId: data.withItemId } : {}),
      ...(data.minutes ? { minutes: data.minutes } : {}),
    },
  });
  if (!result.ok) return result;

  // The trigger wrote one notification per guardian; push them once the learner has the answer.
  const householdId = context.householdId;
  after(async () => {
    await pushPending(householdId, ["request"]).catch(() => null);
  });
  revalidatePath("/parent");
  return { ok: true as const, id: result.id };
}

/** Today's periods, for the swap picker. */
export async function todayPeriodsAction() {
  const guard = await requireLearnerSession();
  if (!guard.ok) return { ok: false as const, error: guard.error, items: [] };
  const state = await getSetupState();
  const timezone = state.status === "configured" ? state.timezone : null;
  const items = await getDayPlanItems(guard.learnerId, todayIso(new Date(), timezone));
  return {
    ok: true as const,
    items: items
      .filter((item) => item.itemType !== "break" && (item.status === "planned" || item.status === "deferred"))
      .map((item) => ({ id: item.id, title: item.subjectName ? `${item.subjectName}: ${item.title}` : item.title })),
  };
}
