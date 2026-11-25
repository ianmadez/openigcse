import { dayOfWeekFor, getOverrideForDate, getTimetableSlots, type SlotType } from "@/lib/data/timetable";
import { getLearnerWorkspace, type ActivitySignal } from "@/lib/data/workspace";
import { allowanceFor, rankActivities } from "@/lib/planning/nextBestActivity";
import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * The daily plan generator.
 *
 * The timetable decides *when* and *which subject*; the ranking engine decides
 * *what* to do inside that period. Keeping the split means a parent sets the
 * shape of the week without hand-picking objectives, which is the whole point
 * of the timetable.
 *
 * It runs on first open of /today and on demand from the parent editor. It is
 * idempotent: one item per slot per day, enforced by a unique index, so running
 * it twice never duplicates a plan.
 */

export type GenerationResult = {
  ok: boolean;
  created: number;
  carriedOver: number;
  skipped?: number;
  reason?: string;
};

const ITEM_TYPE: Record<SlotType, "lesson" | "review" | "assessment" | "break"> = {
  subject: "lesson",
  revision: "review",
  assessment: "assessment",
  break: "break",
  free_study: "lesson",
};

/** A day off produces no plan; the streak survives if the override says so. */
const NO_SCHOOL = new Set(["holiday", "sick_day"]);

export async function generateDayPlan(input: {
  learnerId: string;
  householdId: string;
  termId: string;
  date: string;
}): Promise<GenerationResult> {
  const { learnerId, householdId, termId, date } = input;

  if (!learnerId || !householdId || !termId) {
    return { ok: false, created: 0, carriedOver: 0, reason: "No term is running, so there is nothing to plan." };
  }

  const override = await getOverrideForDate(householdId, date);

  if (override && NO_SCHOOL.has(override.type)) {
    return { ok: true, created: 0, carriedOver: 0, reason: `The day is marked as ${override.type}.` };
  }

  const slots = (await getTimetableSlots(termId)).filter((slot) => slot.dayOfWeek === dayOfWeekFor(date));

  if (slots.length === 0) {
    return { ok: false, created: 0, carriedOver: 0, reason: "No timetable is set for this weekday yet." };
  }

  const workspace = await getLearnerWorkspace(learnerId);
  const supabase = await createServerClientInstance();

  const { data: existing } = await supabase
    .from("day_plan_items")
    .select("id, slot_id, status")
    .eq("student_id", learnerId)
    .eq("plan_date", date);

  const bySlot = new Map((existing ?? []).filter((row) => row.slot_id).map((row) => [row.slot_id as string, row]));

  // The daily cap is a deliberate per-date decision (a half day, a sick day you
  // still want some work on). The term's own cap is advisory and shows as an
  // over-cap warning in the editor, so it never deletes a period here.
  const cap = override?.customMinutesCap ?? null;
  let planned = 0;
  let created = 0;
  let carriedOver = 0;
  let skipped = 0;
  let failure: string | null = null;
  const usedObjectives = new Set<string>();

  for (const [index, slot] of slots.entries()) {
    if (bySlot.has(slot.id)) continue;

    const minutes = slot.endMinutes - slot.startMinutes;
    if (minutes <= 0) continue;

    const itemType = ITEM_TYPE[slot.slotType];
    const isAcademic = slot.slotType === "subject" || slot.slotType === "revision" || slot.slotType === "free_study";

    // A break never counts against the study cap; everything else does.
    const allowance = allowanceFor(minutes, itemType === "break", cap, planned);
    if (allowance <= 0) continue;
    if (itemType !== "break") planned += allowance;

    const pick =
      isAcademic && slot.subjectCode ? bestForSubject(workspace.signals, slot.subjectCode, usedObjectives) : null;
    if (pick) usedObjectives.add(pick.signal.objectiveCode);

    // Roll a half-finished item forward into the next slot for the same subject
    // instead of re-picking, so the learner continues what they were doing.
    const carried = isAcademic && slot.subjectId ? await carryOver(supabase, learnerId, date, slot.subjectId) : null;

    if (carried) {
      carriedOver += 1;
      continue;
    }

    const { error } = await supabase.from("day_plan_items").insert({
      household_id: householdId,
      student_id: learnerId,
      plan_date: date,
      slot_id: slot.id,
      sequence: index,
      item_type: itemType,
      subject_id: slot.subjectId,
      learning_objective_id: pick?.signal ? objectiveIdOf(workspace, pick.signal) : null,
      title: pick?.title ?? slot.title ?? slot.subjectName ?? labelFor(slot.slotType),
      reasons: pick?.reasons ?? [],
      planned_minutes: allowance,
      status: "planned",
    });

    // The loop already skips slots that have an item, so this insert is the
    // idempotent path. Two renders can still race here (dev prefetch, a second
    // tab), so a duplicate key means "already built", not a failure.
    if (error) {
      if (error.code === "23505") {
        skipped += 1;
        continue;
      }
      if (!failure) failure = error.message;
      continue;
    }

    created += 1;
  }

  if (failure) {
    return { ok: false, created, carriedOver, skipped, reason: failure };
  }

  if (created === 0 && carriedOver === 0) {
    return { ok: true, created: 0, carriedOver: 0, skipped, reason: "Today's plan is already built." };
  }

  return { ok: true, created, carriedOver, skipped };
}

function labelFor(slotType: SlotType) {
  return SLOT_TYPES_LABEL[slotType];
}

const SLOT_TYPES_LABEL: Record<SlotType, string> = {
  subject: "Lesson",
  revision: "Revision",
  assessment: "Assessment",
  break: "Break",
  free_study: "Free study",
};

function bestForSubject(signals: ActivitySignal[], subjectCode: string, used: Set<string>) {
  const candidates = signals.filter((signal) => signal.subjectCode === subjectCode);
  if (candidates.length === 0) return null;

  // A day should not hand the same objective twice in a row. Only fall back to
  // a used one when the subject has nothing else left to rank.
  const fresh = candidates.filter((signal) => !used.has(signal.objectiveCode));
  const [top] = rankActivities(fresh.length > 0 ? fresh : candidates, 1);
  if (!top) return null;

  return { signal: top, title: top.objectiveText, reasons: top.reasons };
}

/** Maps an objective code back to its row id, which the plan item stores. */
function objectiveIdOf(workspace: Awaited<ReturnType<typeof getLearnerWorkspace>>, signal: ActivitySignal) {
  for (const subject of workspace.subjects) {
    for (const objective of subject.objectives) {
      if (objective.code === signal.objectiveCode) return objective.id;
    }
  }
  return null;
}

/**
 * Moves one unfinished item from an earlier day into today, but only if it
 * belongs to the same subject and only once per slot.
 */
async function carryOver(
  supabase: Awaited<ReturnType<typeof createServerClientInstance>>,
  learnerId: string,
  date: string,
  subjectId: string,
) {
  const { data: candidates } = await supabase
    .from("day_plan_items")
    .select("id")
    .eq("student_id", learnerId)
    .eq("subject_id", subjectId)
    .lt("plan_date", date)
    .in("status", ["planned", "deferred", "in_progress"])
    .order("plan_date", { ascending: false })
    .limit(1);

  const target = candidates?.[0];
  if (!target) return null;

  const { error } = await supabase
    .from("day_plan_items")
    .update({ plan_date: date, status: "planned" })
    .eq("id", target.id);

  return error ? null : { id: target.id };
}
