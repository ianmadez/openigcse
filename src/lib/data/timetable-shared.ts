/**
 * Timetable shapes and time helpers.
 *
 * Deliberately free of `next/headers` and Supabase: client components import
 * from here, while the repository in `timetable.ts` owns the queries and
 * re-exports these so server code only needs one import.
 */

export type SlotType = "subject" | "break" | "revision" | "assessment" | "free_study";

export const SLOT_TYPES: Array<{ value: SlotType; label: string }> = [
  { value: "subject", label: "Lesson" },
  { value: "revision", label: "Revision" },
  { value: "assessment", label: "Assessment" },
  { value: "break", label: "Break" },
  { value: "free_study", label: "Free study" },
];

export type TimetableSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  slotType: SlotType;
  subjectId: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  title: string | null;
  colour: string | null;
};

export type TimetableOverride = {
  id: string;
  date: string;
  type: string;
  reason: string;
  preserveStreak: boolean;
  customMinutesCap: number | null;
};

export type DayPlanItemStatus = "planned" | "in_progress" | "done" | "deferred" | "skipped";

export type DayPlanItem = {
  id: string;
  slotId: string | null;
  title: string;
  itemType: string;
  subjectId: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  objectiveId: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  status: DayPlanItemStatus;
  sequence: number;
  reasons: string[];
  studentReordered: boolean;
  skipReason: string | null;
  startedAt: string | null;
  /** Syllabus code of the objective, to match lesson resources. */
  objectiveCode: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  startTime: string | null;
  endTime: string | null;
};

/** "09:15:00" -> 555. Postgres returns time columns with seconds. */
export function toMinutes(time: string) {
  const [hours, minutes] = time.split(":");
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

/** 555 -> "09:15", which is what an <input type="time"> expects. */
export function toTimeString(minutes: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Faculty colour token per subject code, shared by the grid and the chips. */
export const SUBJECT_COLOUR: Record<string, string> = {
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

/** Weekday a plan date falls on, using the same 1=Monday convention as the table. */
export function dayOfWeekFor(date: string) {
  const value = new Date(`${date}T00:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
}

/** "HH:MM" from a time input, as minutes after midnight; null when it cannot be read. */
function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  return hours < 24 && mins < 60 ? hours * 60 + mins : null;
}

type PhoneSlotResult = { ok: true; startMinutes: number; endMinutes: number } | { ok: false; error: string };

/**
 * The phone timetable editor (Step 7.2) takes typed start and end times instead of a drag. Both
 * snap to the same 15-minute grid as the desktop editor and must sit inside the school day.
 */
export function phoneSlotTimes(start: string, end: string, day: { schoolStart: number; schoolEnd: number }): PhoneSlotResult {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (from === null || to === null) return { ok: false, error: "Enter a start and an end time." };
  const startMinutes = Math.round(from / 15) * 15;
  const endMinutes = Math.round(to / 15) * 15;
  if (endMinutes <= startMinutes) return { ok: false, error: "The end has to come after the start." };
  if (startMinutes < day.schoolStart || endMinutes > day.schoolEnd) {
    return { ok: false, error: `Keep the block between ${toTimeString(day.schoolStart)} and ${toTimeString(day.schoolEnd)}.` };
  }
  return { ok: true, startMinutes, endMinutes };
}
