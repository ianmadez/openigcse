import { Clock, Target } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { EmptyState, Meter, PageHeading, Panel } from "@/components/ui/primitives";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { isoDate } from "@/lib/data/dates";
import { getLearningEvents, minutesSince } from "@/lib/data/events";
import { countOpen, getMistakes } from "@/lib/data/mistakes";
import { getRetention, masteryByObjective } from "@/lib/data/retention";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

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

  const [subjects, events, retention, mistakes] = await Promise.all([
    state.activeTermId ? getEnrolledCurriculum(state.learnerId, state.activeTermId) : Promise.resolve([]),
    getLearningEvents(state.learnerId, isoDate(-28)),
    getRetention(state.learnerId),
    getMistakes(state.learnerId),
  ]);

  const mastery = masteryByObjective(retention);
  const studiedCodes = new Set(events.map((event) => event.objectiveCode).filter(Boolean));
  const minutesThisWeek = minutesSince(events, isoDate(-7));
  const open = countOpen(mistakes);
  const objectives = subjects.reduce((sum, subject) => sum + subject.counts.objectives, 0);
  const topics = subjects.reduce((sum, subject) => sum + subject.counts.topics, 0);

  return (
    <>
      <PageHeading eyebrow="Progress" title="Where you are">
        Mastery is the share of objectives you can answer without help. It climbs when mistakes close and checkpoints
        pass, so it stays at zero until the first events are recorded.
      </PageHeading>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="label">Study minutes</p>
          <p className="mt-1 text-title font-semibold text-primary tabular">{minutesThisWeek}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <Clock aria-hidden="true" className="size-3.5" strokeWidth={2} />
            last seven days
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
          <p className="label">Objectives</p>
          <p className="mt-1 text-title font-semibold text-primary tabular">{objectives}</p>
          <p className="mt-0.5 text-caption text-muted">across {topics} topics</p>
        </div>
      </div>

      <Panel title="Mastery by subject" description="Retention state per objective, averaged over the syllabus.">
        {subjects.length === 0 ? (
          <EmptyState title="Nothing enrolled yet">
            Mastery is calculated per objective, so it needs the term's enrolments first.
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {subjects.map((subject) => {
              const values = subject.objectives.map((objective) => mastery.get(objective.id) ?? 0);
              const average = values.length
                ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
                : 0;
              const studied = subject.objectives.filter((objective) => studiedCodes.has(objective.code)).length;

              return (
                <li key={subject.enrollmentId}>
                  <Meter
                    value={average}
                    label={`${subject.subjectCode} ${subject.subjectName}`}
                    hint={`${studied} of ${subject.counts.objectives} objectives have an event`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
