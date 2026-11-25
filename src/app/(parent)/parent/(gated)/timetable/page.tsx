import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { OverridePanel } from "@/components/parent/OverridePanel";
import { TimetableEditor, type PaletteSubject } from "@/components/parent/TimetableEditor";
import { Callout, EmptyState, PageHeading, Panel } from "@/components/ui/primitives";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { todayIso } from "@/lib/data/dates";
import { getSetupState } from "@/lib/data/session";
import { getOverrides, getTimetableSlots, toMinutes } from "@/lib/data/timetable";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Timetable" };

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

export default async function ParentTimetablePage() {
  const state = await getSetupState();

  if (state.status !== "configured" || !state.activeTermId) {
    return (
      <>
        <PageHeading eyebrow="Timetable" title="The school week">
          Draw the week once and the learner's day follows it: the timetable decides when and which subject, the
          ranking engine decides what to do inside the period.
        </PageHeading>
        {state.status === "configured" ? (
          <EmptyState title="No term is running">
            A timetable hangs off a term, so create the first term in onboarding and come back.
          </EmptyState>
        ) : (
          <NeedsSignIn />
        )}
      </>
    );
  }

  const [subjects, slots, overrides, hours] = await Promise.all([
    getEnrolledCurriculum(state.learnerId, state.activeTermId),
    getTimetableSlots(state.activeTermId),
    getOverrides(state.householdId, todayIso(new Date(), state.timezone)),
    schoolHours(state.householdId, state.activeTermId),
  ]);

  const palette: PaletteSubject[] = subjects.map((subject) => ({
    subjectId: subject.subjectId,
    code: subject.subjectCode,
    name: subject.subjectName,
    weeklyMinutes: subject.weeklyMinutes,
    colour: COLOUR[subject.subjectCode] ?? "stem",
  }));

  const today = todayIso(new Date(), state.timezone);

  return (
    <>
      <PageHeading eyebrow={`${state.term?.name ?? "Term"} - ${state.learnerName}`} title="The school week">
        Drag a block to move it, drag its bottom edge to resize. Every change saves immediately, and the learner sees it
        on their next refresh.
      </PageHeading>

      {palette.length === 0 ? (
        <EmptyState title="No subjects enrolled yet">
          The palette is built from this term's enrolments, so add the papers being entered first.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4">
            <Callout tone="info" title={`School hours are ${hourLabel(hours.start)} to ${hourLabel(hours.end)}`}>
              They come from the term, so a half day or a late start is one term setting rather than a redesign of the
              grid.
            </Callout>
          </div>

          <TimetableEditor
            slots={slots}
            subjects={palette}
            schoolStart={hours.start}
            schoolEnd={hours.end}
            dailyCap={state.term?.dailyMinutesCap ?? 120}
            today={today}
          />

          <div className="mt-5">
            <Panel
              title="Calendar exceptions"
              description="A date here replaces the weekly template, so a holiday is not a deleted week."
            >
              <OverridePanel overrides={overrides} today={today} />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

async function schoolHours(householdId: string, termId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academic_terms")
    .select("school_day_start, school_day_end")
    .eq("id", termId)
    .eq("household_id", householdId)
    .maybeSingle<{ school_day_start: string | null; school_day_end: string | null }>();

  return {
    start: data?.school_day_start ? toMinutes(data.school_day_start) : 8 * 60,
    end: data?.school_day_end ? toMinutes(data.school_day_end) : 15 * 60,
  };
}

function hourLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
