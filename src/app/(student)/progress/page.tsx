import { CalendarClock, Clock, Target } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { MasteryMap } from "@/components/student/MasteryMap";
import { Callout, EmptyState, Meter, PageHeading, Panel } from "@/components/ui/primitives";
import { getTermAssessments } from "@/lib/data/assessments";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { isoDate } from "@/lib/data/dates";
import { getLearningEvents, minutesSince } from "@/lib/data/events";
import { getObjectiveMastery } from "@/lib/data/mastery";
import { countOpen, getMistakes } from "@/lib/data/mistakes";
import { getSetupState } from "@/lib/data/session";
import { getPlannedMinutes } from "@/lib/data/timetable";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

const daysFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export default async function ProgressPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Progress" title="Where you are">
          Minutes, mastery and open mistakes, all derived from the learner's own events.
        </PageHeading>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const [subjects, events, mastery, mistakes, assessments, plannedMinutes] = await Promise.all([
    state.activeTermId ? getEnrolledCurriculum(state.learnerId, state.activeTermId) : Promise.resolve([]),
    getLearningEvents(state.learnerId, isoDate(-28)),
    getObjectiveMastery(state.learnerId),
    getMistakes(state.learnerId),
    state.activeTermId ? getTermAssessments(state.activeTermId) : Promise.resolve([]),
    getPlannedMinutes(state.learnerId, isoDate(-7), isoDate(0)),
  ]);

  const masteryById = new Map(mastery.items.map((item) => [item.objectiveId, item]));
  const minutesThisWeek = minutesSince(events, isoDate(-7));
  const open = countOpen(mistakes);
  const objectives = subjects.reduce((sum, subject) => sum + subject.counts.objectives, 0);
  // Topics the enrolled objectives sit under, not every topic row (parents included).
  const topics = new Set(subjects.flatMap((subject) => subject.objectives.map((o) => `${subject.subjectCode}:${o.topicCode}`))).size;
  const next = assessments.find((assessment) => assessment.scheduledFor) ?? null;

  const mapSubjects = subjects.map((subject) => ({
    key: subject.enrollmentId,
    code: subject.subjectCode,
    name: subject.subjectName,
    objectives: subject.objectives.map((objective) => {
      const row = masteryById.get(objective.id);
      return {
        id: objective.id,
        code: objective.code,
        title: objective.text,
        topicName: objective.topicName || objective.topicCode,
        mastery: row?.mastery ?? 0,
        covered: row?.covered ?? false,
      };
    }),
  }));

  return (
    <>
      <PageHeading eyebrow="Progress" title="Where you are">
        Mastery is computed from what you have actually done: checkpoints, practice and marked papers, weighted by
        recency and blended with how well the schedule says you still remember each objective.
      </PageHeading>

      {mastery.error && (
        <div className="mb-4">
          <Callout tone="warning" title="Mastery is not being read">
            {mastery.error} The rest of this page is still live; the mastery map fills in when the database function
            exists.
          </Callout>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <p className="label">Study minutes</p>
          <p className="mt-1 text-title font-semibold text-primary tabular">{minutesThisWeek}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <Clock aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {plannedMinutes > 0 ? `of ${plannedMinutes} planned this week` : "last seven days"}
          </p>
        </div>
        <div className="surface p-4">
          <p className="label">Open mistakes</p>
          <p className="mt-1 text-title font-semibold text-primary tabular">{open}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <Target aria-hidden="true" className="size-3.5" strokeWidth={2} />
            clear these first
          </p>
        </div>
        <div className="surface p-4">
          <p className="label">Next exam</p>
          <p className="mt-1 text-title font-semibold text-primary tabular">
            {next ? (next.daysUntil === 0 ? "Today" : `${next.daysUntil} ${next.daysUntil === 1 ? "day" : "days"}`) : "None"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <CalendarClock aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {next ? `${next.title}, ${daysFormat.format(new Date(next.scheduledFor))}` : "nothing scheduled"}
          </p>
        </div>
        <div className="surface p-4">
          <p className="label">Objectives</p>
          <p className="mt-1 text-title font-semibold text-primary tabular">{objectives}</p>
          <p className="mt-0.5 text-caption text-muted">across {topics} {topics === 1 ? "topic" : "topics"}</p>
        </div>
      </div>

      <div className="mb-4">
        <Panel title="Mastery by subject" description="Averaged across every enrolled objective, covered or not.">
          {subjects.length === 0 ? (
            <EmptyState title="Nothing enrolled yet">
              Mastery is calculated per objective, so it needs the term's enrolments first.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {subjects.map((subject) => {
                const rows = subject.objectives.map((objective) => masteryById.get(objective.id));
                const values = rows.map((row) => row?.mastery ?? 0);
                const average = values.length
                  ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
                  : 0;
                const covered = rows.filter((row) => row?.covered).length;

                return (
                  <li key={subject.enrollmentId}>
                    <Meter
                      value={average}
                      label={`${subject.subjectCode} ${subject.subjectName}`}
                      hint={`${covered} of ${subject.counts.objectives} objectives have evidence`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Syllabus map"
        description="Every objective, coloured by its current mastery. A dash means nothing has been recorded on it yet."
      >
        {mapSubjects.length === 0 ? (
          <EmptyState title="No syllabus to map">Enrol a subject on this term and its objectives appear here.</EmptyState>
        ) : (
          <MasteryMap subjects={mapSubjects} />
        )}
      </Panel>
    </>
  );
}
