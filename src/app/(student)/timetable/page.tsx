import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { TimetableWeek } from "@/components/student/TimetableWeek";
import { EmptyState, PageHeading } from "@/components/ui/primitives";
import { getSetupState } from "@/lib/data/session";
import { dayOfWeekFor, getOverrides, getTimetableSlots } from "@/lib/data/timetable";
import { todayIso } from "@/lib/data/dates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Timetable" };

export default async function StudentTimetablePage() {
  const state = await getSetupState();

  if (state.status !== "configured" || !state.activeTermId) {
    return (
      <>
        <PageHeading eyebrow="Timetable" title="Your week">
          The week your parent drew, with any holidays or half days already applied.
        </PageHeading>
        {state.status === "configured" ? (
          <EmptyState title="No term is running">A timetable hangs off a term, so this fills in once one starts.</EmptyState>
        ) : (
          <NeedsSignIn audience="learner" />
        )}
      </>
    );
  }

  const [slots, overrides] = await Promise.all([
    getTimetableSlots(state.activeTermId),
    getOverrides(state.householdId, todayIso(new Date(), state.timezone)),
  ]);

  const today = todayIso(new Date(), state.timezone);

  return (
    <>
      <PageHeading eyebrow={state.term?.name ?? "Term"} title="Your week">
        This is the shape of the week, not the tasks: open Today to see what to do inside each period.
      </PageHeading>

      <TimetableWeek
        slots={slots}
        todayDay={dayOfWeekFor(today)}
        overrides={overrides.map((override) => ({
          date: override.date,
          type: override.type,
          reason: override.reason,
        }))}
      />
    </>
  );
}
