import { CalendarClock, ShieldCheck } from "lucide-react";
import { relativeDays } from "@/lib/data/dates";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { DayStrip } from "@/components/student/DayStrip";
import { TodayPeriods } from "@/components/student/TodayPeriods";
import { StudyBlock } from "@/components/student/StudyBlock";
import { Callout, DemoNote, EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { todayIso } from "@/lib/data/dates";
import { generateDayPlan } from "@/lib/data/plan";
import { demoMode, getSetupState } from "@/lib/data/session";
import { getDayPlanItems } from "@/lib/data/timetable";
import { getLearnerWorkspace } from "@/lib/data/workspace";
import { totalMinutes } from "@/lib/planning/nextBestActivity";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata = { title: "Today" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default async function TodayPage() {
  const state = await getSetupState();
  const demo = demoMode();

  if (state.status !== "configured" && !demo) {
    return (
      <>
        <PageHeading eyebrow={<time dateTime={new Date().toISOString().slice(0, 10)}>{dateFormat.format(new Date())}</time>} title="Today">
          The day is built from the learner's timetable, enrolments and learning events.
        </PageHeading>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const today = todayIso(new Date(), state.status === "configured" ? state.timezone : null);
  let periods: Awaited<ReturnType<typeof getDayPlanItems>> = [];
  let generated = 0;

  // First open of the day builds it: the timetable decides when and which
  // subject, the ranking engine decides what to do inside the period.
  if (state.status === "configured" && state.activeTermId) {
    const generation = await generateDayPlan({
      learnerId: state.learnerId,
      householdId: state.householdId,
      termId: state.activeTermId,
      date: today,
    }).catch(() => ({ ok: false, created: 0, carriedOver: 0, skipped: 0 }));

    generated = (generation.created ?? 0) + (generation.skipped ?? 0) + (generation.carriedOver ?? 0);
    periods = await getDayPlanItems(state.learnerId, today);

    // Two renders can overlap (a prefetch and a navigation, or a second tab).
    // If this render lost that race the rows are there a moment later, so one
    // retry beats showing an empty day that a refresh fixes.
    if (periods.length === 0 && generated > 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      periods = await getDayPlanItems(state.learnerId, today);
    }
  }

  const workspace = await getLearnerWorkspace(state.status === "configured" ? state.learnerId : null);
  const planPeriods = periods;

  const minutes = totalMinutes(workspace.planned);
  const next = workspace.assessments[0];
  const academicPeriods = planPeriods.filter((period) => period.itemType !== "break");
  const plannedToday = academicPeriods.reduce((sum, period) => sum + period.plannedMinutes, 0);

  return (
    <>
      <PageHeading eyebrow={<time dateTime={new Date().toISOString().slice(0, 10)}>{dateFormat.format(new Date())}</time>} title={`Morning, ${workspace.learner.displayName}`}>
        {academicPeriods.length > 0
          ? `${academicPeriods.length} ${academicPeriods.length === 1 ? "period" : "periods"} today, ${plannedToday} minutes planned.`
          : workspace.planned.length > 0
            ? `${workspace.planned.length} things are worth doing today, in the order you choose. ${minutes} minutes in total.`
            : "Nothing is queued yet."}{" "}
        {next ? `The ${next.title.toLowerCase()} is ${relativeDays(next.daysUntil)}.` : ""}
      </PageHeading>

      {next && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Status tone="warning">
            <CalendarClock aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {next.title} {relativeDays(next.daysUntil)}
          </Status>
          <Status tone="neutral">
            <ShieldCheck aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Focus lock is on
          </Status>
        </div>
      )}

      <DayStrip items={planPeriods} />

      {planPeriods.length > 0 ? (
        <Panel
          title="Period by period"
          description="Start a task, finish it to log the time, or skip it with a reason."
          className="mb-5"
        >
          <TodayPeriods items={planPeriods} resources={workspace.resources} />
        </Panel>
      ) : (
        <div className="mb-5">
          <Callout tone="neutral" title="No timetable for today yet">
            The plan is empty, so the queue below is ranked straight from the enrolled objectives. Once a parent draws
            the week, this becomes the period-by-period day.
          </Callout>
        </div>
      )}

      {workspace.planned.length === 0 ? (
        <EmptyState title="Nothing to study yet">
          Enrol a subject on this term and its objectives become available to rank. Until then there is no queue to
          work through.
        </EmptyState>
      ) : (
        <StudyBlock tasks={workspace.planned} checkpoints={workspace.checkpoints} resources={workspace.resources} />
      )}

      <div className="mt-5 grid items-start gap-3 sm:grid-cols-2">
        {workspace.planned.length > 0 && (
          <Panel title="Why this order" description="Ranked from due reviews, mistakes, assessment dates and mastery.">
            <ul className="space-y-2 text-caption leading-relaxed text-secondary">
              {workspace.planned.map((task) => (
                <li key={task.objectiveCode} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>
                    <span className="font-medium text-primary">{task.topicName}:</span>{" "}
                    {task.reasons.join("; ").toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
            {workspace.source === "demo" && (
              <DemoNote>DEMO_MODE is on, so this queue is fixed sample content, not the household's syllabus.</DemoNote>
            )}
          </Panel>
        )}

        <Callout tone="info" title="Stuck is allowed">
          Use the button next to any objective and it reaches the parent dashboard. Nothing is deducted and the streak
          stays as it is.
        </Callout>
      </div>
    </>
  );
}
