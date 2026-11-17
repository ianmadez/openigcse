"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeGuardian } from "@/lib/auth/guard";
import { generateDayPlan } from "@/lib/data/plan";
import {
  deleteOverride,
  deleteSlot,
  getTimetableSlots,
  reorderPlanItem,
  saveOverride,
  saveSlot,
  setPlanItemStatus,
  type SlotType,
} from "@/lib/data/timetable";
import { createAdminClient } from "@/lib/supabase/admin";

const REVIEW = ["/parent/timetable", "/today", "/timetable"];

const SLOT_TYPE = z.enum(["subject", "break", "revision", "assessment", "free_study"]);

const slotSchema = z.object({
  id: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(1).max(7),
  startMinutes: z.number().int().min(0).max(24 * 60 - 15),
  endMinutes: z.number().int().min(15).max(24 * 60),
  slotType: SLOT_TYPE,
  subjectId: z.string().uuid().nullable(),
  title: z.string().max(80).nullable(),
  colour: z.string().max(20).nullable(),
});

const COLOUR: Record<string, string> = {
  "0610": "biology",
  "0620": "physics",
  "0625": "physics",
  "0580": "stem",
  "0478": "stem",
  "0460": "humanities",
  "0470": "humanities",
  "0455": "humanities",
  "0500": "languages",
  "0520": "languages",
  "0530": "languages",
};

export async function saveSlotAction(input: unknown) {
  const active = await authorizeGuardian();
  if (!active) return { ok: false as const, error: "Unlock the parent area before editing the timetable." };

  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the slot." };

  const { termId, subjects } = await householdContext(active.householdId);
  if (!termId) return { ok: false as const, error: "No term is running, so there is nowhere to save this." };

  if (parsed.data.endMinutes - parsed.data.startMinutes < 15) {
    return { ok: false as const, error: "A block needs at least 15 minutes." };
  }

  const result = await saveSlot(
    {
      ...parsed.data,
      termId,
      colour: parsed.data.colour ?? defaultColour(parsed.data.subjectId, subjects),
    },
    active.householdId,
  );

  if (!result.ok) return { ok: false as const, error: result.error };

  REVIEW.forEach((path) => revalidatePath(path));
  return { ok: true as const, id: result.id };
}

export async function deleteSlotAction(id: string) {
  const active = await authorizeGuardian();
  if (!active) return { ok: false as const, error: "Unlock the parent area before editing the timetable." };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const, error: "That is not a slot id." };

  const result = await deleteSlot(parsed.data);
  if (!result.ok) return { ok: false as const, error: result.error };

  REVIEW.forEach((path) => revalidatePath(path));
  return { ok: true as const };
}

/** Duplicates Monday across Tuesday to Friday, which is how most weeks look. */
export async function copyMondayAction() {
  const active = await authorizeGuardian();
  if (!active) return { ok: false as const, error: "Unlock the parent area before editing the timetable." };

  const { termId } = await householdContext(active.householdId);
  if (!termId) return { ok: false as const, error: "No term is running." };

  const slots = await getTimetableSlots(termId);
  const monday = slots.filter((slot) => slot.dayOfWeek === 1);

  if (monday.length === 0) return { ok: false as const, error: "Monday has nothing to copy yet." };

  let copied = 0;

  for (const day of [2, 3, 4, 5]) {
    for (const slot of monday) {
      const clash = slots.some(
        (existing) =>
          existing.dayOfWeek === day && existing.startMinutes < slot.endMinutes && slot.startMinutes < existing.endMinutes,
      );
      if (clash) continue;

      const result = await saveSlot(
        {
          termId,
          dayOfWeek: day,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          slotType: slot.slotType as SlotType,
          subjectId: slot.subjectId,
          title: slot.title,
          colour: slot.colour,
        },
        active.householdId,
      );

      if (result.ok) copied += 1;
    }
  }

  REVIEW.forEach((path) => revalidatePath(path));
  return copied > 0
    ? { ok: true as const, copied }
    : { ok: false as const, error: "Every weekday already has a block in that time." };
}

export async function clearWeekAction() {
  const active = await authorizeGuardian();
  if (!active) return { ok: false as const, error: "Unlock the parent area before editing the timetable." };

  const { termId } = await householdContext(active.householdId);
  if (!termId) return { ok: false as const, error: "No term is running." };

  const slots = await getTimetableSlots(termId);
  for (const slot of slots) await deleteSlot(slot.id);

  REVIEW.forEach((path) => revalidatePath(path));
  return { ok: true as const, cleared: slots.length };
}

const overrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  type: z.enum(["holiday", "sick_day", "half_day", "ramadan_schedule", "exam_day", "custom"]),
  reason: z.string().max(120).default(""),
  preserveStreak: z.boolean().default(true),
  customMinutesCap: z.number().int().min(0).max(600).nullable().default(null),
});

export async function saveOverrideAction(input: unknown) {
  const active = await authorizeGuardian();
  if (!active) return { ok: false as const, error: "Unlock the parent area before changing the calendar." };

  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the date." };

  const result = await saveOverride({
    ...parsed.data,
    householdId: active.householdId,
    profileId: active.profileId,
  });

  if (!result.ok) return { ok: false as const, error: result.error };

  REVIEW.forEach((path) => revalidatePath(path));
  return { ok: true as const };
}

export async function deleteOverrideAction(id: string) {
  const active = await authorizeGuardian();
  if (!active) return { ok: false as const, error: "Unlock the parent area before changing the calendar." };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const, error: "That is not an override id." };

  const result = await deleteOverride(parsed.data);
  if (!result.ok) return { ok: false as const, error: result.error };

  REVIEW.forEach((path) => revalidatePath(path));
  return { ok: true as const };
}

/** Builds the day the learner sees. Idempotent, so pressing it twice is safe. */
export async function generatePlanAction(date: string) {
  const active = await authorizeGuardian();
  if (!active) {
    return { ok: false as const, created: 0, carriedOver: 0, error: "Unlock the parent area first." };
  }

  const parsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(date);
  if (!parsed.success) return { ok: false as const, created: 0, carriedOver: 0, error: "Pick a date." };

  const { termId, learnerId } = await householdContext(active.householdId);
  if (!termId || !learnerId) {
    return { ok: false as const, created: 0, carriedOver: 0, error: "This household has no term or learner yet." };
  }

  const result = await generateDayPlan({ learnerId, householdId: active.householdId, termId, date: parsed.data });

  REVIEW.forEach((path) => revalidatePath(path));
  return { ...result, error: result.ok ? undefined : result.reason };
}

/** Learner-side: mark a period started or done, and record a reorder. */
export async function updatePlanItemAction(input: unknown) {
  const parsed = z
    .object({
      id: z.string().uuid(),
      status: z.enum(["planned", "in_progress", "done", "deferred", "skipped"]).optional(),
      sequence: z.number().int().min(0).max(99).optional(),
    })
    .safeParse(input);

  if (!parsed.success) return { ok: false as const, error: "That is not a plan item." };

  const result =
    parsed.data.sequence !== undefined
      ? await reorderPlanItem(parsed.data.id, parsed.data.sequence)
      : await setPlanItemStatus(parsed.data.id, parsed.data.status ?? "planned");

  if (!result.ok) return { ok: false as const, error: result.error };

  revalidatePath("/today");
  return { ok: true as const };
}

/** The running term and learner for this household, resolved server-side. */
async function householdContext(householdId: string) {
  const admin = createAdminClient();

  const [{ data: term }, { data: learner }, { data: subjects }] = await Promise.all([
    admin
      .from("academic_terms")
      .select("id")
      .eq("household_id", householdId)
      .eq("status", "active")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>(),
    admin
      .from("profiles")
      .select("id")
      .eq("household_id", householdId)
      .eq("role", "student")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>(),
    admin.from("subjects").select("id, subject_code"),
  ]);

  return {
    termId: term?.id ?? null,
    learnerId: learner?.id ?? null,
    subjects: (subjects ?? []) as { id: string; subject_code: string }[],
  };
}

function defaultColour(subjectId: string | null, subjects: { id: string; subject_code: string }[]) {
  if (!subjectId) return null;
  const code = subjects.find((subject) => subject.id === subjectId)?.subject_code;
  return code ? (COLOUR[code] ?? "stem") : "stem";
}
