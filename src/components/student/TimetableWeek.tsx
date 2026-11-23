import { EmptyState, Status } from "@/components/ui/primitives";
import type { TimetableSlot } from "@/lib/data/timetable-shared";
import { cn } from "@/lib/utils/cn";

const DAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
];

const LABEL: Record<string, string> = {
  subject: "Lesson",
  revision: "Revision",
  assessment: "Assessment",
  break: "Break",
  free_study: "Free study",
};

function colourStyle(slot: TimetableSlot) {
  const key = slot.colour ?? "stem";
  const token = ["biology", "physics", "humanities", "languages"].includes(key) ? key : "stem";
  return { backgroundColor: `oklch(var(--subject-${token}))` };
}

/**
 * The learner's read-only week.
 *
 * A list per day rather than a positioned grid: at 360 px a grid of seven
 * columns is unreadable, and the learner only needs to know what is next, not
 * to compare column heights.
 */
export function TimetableWeek({
  slots,
  todayDay,
  overrides,
}: {
  slots: TimetableSlot[];
  todayDay: number;
  overrides: Array<{ date: string; type: string; reason: string }>;
}) {
  if (slots.length === 0) {
    return (
      <EmptyState title="No timetable yet">
        Ask a parent to set one up. Once the week is drawn, this page shows exactly what each day looks like.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {overrides.length > 0 && (
        <ul className="space-y-1.5">
          {overrides.map((override) => (
            <li key={override.date} className="flex flex-wrap items-center gap-2 text-caption text-secondary">
              <Status tone="info">{override.type.replace("_", " ")}</Status>
              <span className="tabular">{override.date}</span>
              {override.reason && <span className="text-muted">- {override.reason}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {DAYS.map((day) => {
          const daySlots = slots.filter((slot) => slot.dayOfWeek === day.value);

          return (
            <section key={day.value} className={cn("surface p-4", day.value === todayDay && "border-accent-line")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-heading font-semibold text-primary">{day.label}</h2>
                {day.value === todayDay && <Status tone="accent">Today</Status>}
              </div>

              {daySlots.length === 0 ? (
                <p className="text-caption text-muted">Nothing scheduled.</p>
              ) : (
                <ul className="divide-y divide-subtle">
                  {daySlots.map((slot) => (
                    <li key={slot.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                      <span aria-hidden="true" className="h-6 w-0.5 shrink-0 rounded-full" style={colourStyle(slot)} />
                      <span className="w-24 shrink-0 text-caption text-muted tabular">
                        {slot.startTime}–{slot.endTime}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.875rem] text-primary">
                        {slot.subjectCode ? `${slot.subjectCode} ` : ""}
                        {slot.subjectName ?? slot.title ?? LABEL[slot.slotType]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
