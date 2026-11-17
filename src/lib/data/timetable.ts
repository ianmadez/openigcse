import { unique } from "@/lib/data/query";
import {
  dayOfWeekFor,
  SUBJECT_COLOUR,
  toMinutes,
  toTimeString,
  type DayPlanItem,
  type DayPlanItemStatus,
  type SlotType,
  type TimetableOverride,
  type TimetableSlot,
} from "@/lib/data/timetable-shared";
import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * The weekly timetable, its date overrides and the materialised day.
 *
 * Slots are the template a parent draws; overrides are the exceptions; day plan
 * items are what the learner actually sees on a date. All three are read on the
 * session client, so a learner only ever reads their own household's rows.
 *
 * The shapes and the time helpers live in `timetable-shared.ts` so a client
 * component can import them without pulling in `next/headers`.
 */

export { SLOT_TYPES, SUBJECT_COLOUR, dayOfWeekFor, toMinutes, toTimeString } from "@/lib/data/timetable-shared";
export type {
  DayPlanItem,
  DayPlanItemStatus,
  SlotType,
  TimetableOverride,
  TimetableSlot,
} from "@/lib/data/timetable-shared";

type SlotRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_type: SlotType;
  subject_id: string | null;
  title: string | null;
  colour: string | null;
};

type PlanRow = {
  id: string;
  slot_id: string | null;
  title: string;
  item_type: string;
  subject_id: string | null;
  learning_objective_id: string | null;
  planned_minutes: number;
  actual_minutes: number;
  status: DayPlanItemStatus;
  sequence: number;
  reasons: unknown;
  student_reordered: boolean;
};

function toSlot(row: SlotRow, subject?: { subject_code: string; subject_name: string }): TimetableSlot {
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    startTime: toTimeString(toMinutes(row.start_time)),
    endTime: toTimeString(toMinutes(row.end_time)),
    startMinutes: toMinutes(row.start_time),
    endMinutes: toMinutes(row.end_time),
    slotType: row.slot_type,
    subjectId: row.subject_id,
    subjectCode: subject?.subject_code ?? null,
    subjectName: subject?.subject_name ?? null,
    title: row.title,
    colour: row.colour,
  };
}

async function subjectsById(ids: string[]) {
  const supabase = await createServerClientInstance();
  const { data } = ids.length
    ? await supabase.from("subjects").select("id, subject_code, subject_name").in("id", unique(ids))
    : { data: [] as { id: string; subject_code: string; subject_name: string }[] };

  return new Map((data ?? []).map((row) => [row.id, row]));
}

export async function getTimetableSlots(termId: string): Promise<TimetableSlot[]> {
  if (!termId) return [];

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("timetable_slots")
    .select("id, day_of_week, start_time, end_time, slot_type, subject_id, title, colour")
    .eq("academic_term_id", termId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  const rows = (data ?? []) as SlotRow[];
  const byId = await subjectsById(rows.map((row) => row.subject_id).filter((id): id is string => Boolean(id)));

  return rows.map((row) => toSlot(row, row.subject_id ? byId.get(row.subject_id) : undefined));
}

export async function getOverrides(householdId: string, fromDate?: string): Promise<TimetableOverride[]> {
  if (!householdId) return [];

  const supabase = await createServerClientInstance();
  let query = supabase
    .from("timetable_overrides")
    .select("id, override_date, override_type, reason, preserve_streak, custom_minutes_cap")
    .eq("household_id", householdId)
    .order("override_date", { ascending: true });

  if (fromDate) query = query.gte("override_date", fromDate);

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.override_date,
    type: row.override_type,
    reason: row.reason ?? "",
    preserveStreak: row.preserve_streak ?? true,
    customMinutesCap: row.custom_minutes_cap ?? null,
  }));
}

export async function getOverrideForDate(householdId: string, date: string) {
  const overrides = await getOverrides(householdId);
  return overrides.find((override) => override.date === date) ?? null;
}

export async function getDayPlanItems(learnerId: string, date: string): Promise<DayPlanItem[]> {
  if (!learnerId) return [];

  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("day_plan_items")
    .select(
      "id, slot_id, title, item_type, subject_id, learning_objective_id, planned_minutes, actual_minutes, status, sequence, reasons, student_reordered",
    )
    .eq("student_id", learnerId)
    .eq("plan_date", date)
    .order("sequence", { ascending: true });

  if (error) return [];

  const rows = (data ?? []) as PlanRow[];
  const byId = await subjectsById(rows.map((row) => row.subject_id).filter((id): id is string => Boolean(id)));

  // The slot supplies the clock times; the plan row itself only stores minutes.
  const slotIds = unique(rows.map((row) => row.slot_id).filter((id): id is string => Boolean(id)));
  const { data: slotRows } = slotIds.length
    ? await supabase.from("timetable_slots").select("id, start_time, end_time").in("id", slotIds)
    : { data: [] as { id: string; start_time: string; end_time: string }[] };

  const slotById = new Map((slotRows ?? []).map((slot) => [slot.id, slot]));

  return rows.map((row) => {
    const slot = row.slot_id ? slotById.get(row.slot_id) : undefined;
    const subject = row.subject_id ? byId.get(row.subject_id) : undefined;

    return {
      id: row.id,
      slotId: row.slot_id,
      title: row.title,
      itemType: row.item_type,
      subjectId: row.subject_id,
      subjectCode: subject?.subject_code ?? null,
      subjectName: subject?.subject_name ?? null,
      objectiveId: row.learning_objective_id,
      plannedMinutes: row.planned_minutes,
      actualMinutes: row.actual_minutes,
      status: row.status,
      sequence: row.sequence,
      reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
      studentReordered: row.student_reordered,
      startMinutes: slot ? toMinutes(slot.start_time) : null,
      endMinutes: slot ? toMinutes(slot.end_time) : null,
      startTime: slot ? toTimeString(toMinutes(slot.start_time)) : null,
      endTime: slot ? toTimeString(toMinutes(slot.end_time)) : null,
    };
  });
}

export type SlotInput = {
  id?: string;
  termId: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  slotType: SlotType;
  subjectId: string | null;
  title: string | null;
  colour: string | null;
};

/**
 * Writes one slot. Passing an id updates it, which is what a drag or a resize
 * does; leaving it out creates one.
 */
export async function saveSlot(input: SlotInput, householdId: string) {
  const supabase = await createServerClientInstance();
  const row = {
    household_id: householdId,
    academic_term_id: input.termId,
    day_of_week: input.dayOfWeek,
    start_time: toTimeString(input.startMinutes),
    end_time: toTimeString(input.endMinutes),
    slot_type: input.slotType,
    subject_id: input.subjectId,
    title: input.title,
    colour: input.colour,
  };

  const { data, error } = input.id
    ? await supabase.from("timetable_slots").update(row).eq("id", input.id).select("id").single<{ id: string }>()
    : await supabase.from("timetable_slots").insert(row).select("id").single<{ id: string }>();

  return error ? { ok: false as const, error: error.message } : { ok: true as const, id: data!.id };
}

export async function deleteSlot(id: string) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function saveOverride(input: {
  householdId: string;
  date: string;
  type: string;
  reason: string;
  preserveStreak: boolean;
  customMinutesCap: number | null;
  profileId: string | null;
}) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("timetable_overrides").upsert(
    {
      household_id: input.householdId,
      override_date: input.date,
      override_type: input.type,
      reason: input.reason,
      preserve_streak: input.preserveStreak,
      custom_minutes_cap: input.customMinutesCap,
      created_by: input.profileId,
    },
    { onConflict: "household_id,override_date" },
  );

  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function deleteOverride(id: string) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("timetable_overrides").delete().eq("id", id);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function setPlanItemStatus(id: string, status: DayPlanItemStatus, actualMinutes?: number) {
  const supabase = await createServerClientInstance();
  const patch: Record<string, unknown> = { status };

  if (status === "in_progress") patch.started_at = new Date().toISOString();
  if (status === "done") patch.completed_at = new Date().toISOString();
  if (actualMinutes !== undefined) patch.actual_minutes = actualMinutes;

  const { error } = await supabase.from("day_plan_items").update(patch).eq("id", id);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Records that the learner changed the order, so the parent can see it. */
export async function reorderPlanItem(id: string, sequence: number) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase
    .from("day_plan_items")
    .update({ sequence, student_reordered: true })
    .eq("id", id);

  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export { dayOfWeekFor as dayOfWeekForDate };
