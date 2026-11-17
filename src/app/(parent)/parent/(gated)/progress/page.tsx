import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { Callout, EmptyState, Meter, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { getTermAssessments } from "@/lib/data/assessments";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { isoDate } from "@/lib/data/dates";
import { getLearningEvents, minutesBySubject } from "@/lib/data/events";
import { countByTag, countOpen, getMistakes } from "@/lib/data/mistakes";
import { getRetention, masteryByObjective } from "@/lib/data/retention";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

const TAG_ORDER = [
  "ConceptGap",
  "CommandWordMisread",
  "CalculationSlip",
  "IncompleteExplanation",
  "TimePressure",
] as const;

export default async function ParentProgressPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Progress" title="How the term is tracking">
          Coverage, mastery and what to look at next, per subject.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const [subjects, events, retention, mistakes, assessments] = await Promise.all([
    state.activeTermId ? getEnrolledCurriculum(state.learnerId, state.activeTermId) : Promise.resolve([]),
    getLearningEvents(state.learnerId, isoDate(-28)),
    getRetention(state.learnerId),
    getMistakes(state.learnerId),
    state.activeTermId ? getTermAssessments(state.activeTermId) : Promise.resolve([]),
  ]);

  const mastery = masteryByObjective(retention);
  const tagCounts = countByTag(mistakes);
  const open = countOpen(mistakes);
  const minutes = minutesBySubject(events);
  const studiedCodes = new Set(events.map((event) => event.objectiveCode).filter(Boolean));
  const marked = assessments.filter((assessment) => assessment.status === "marked");

  return (
    <>
      <PageHeading eyebrow={state.term?.name ?? "No active term"} title="How the term is tracking">
        Coverage counts objectives with at least one recorded event. Mastery is the retention state behind them, so both
        stay at zero until the learner starts working.
      </PageHeading>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Coverage" description="Objectives with a recorded event, per subject.">
          {subjects.length === 0 ? (
            <EmptyState title="No enrolments yet">
              Coverage is measured against the enrolled papers, so it needs a term with subjects first.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {subjects.map((subject) => {
                const studied = subject.objectives.filter((objective) => studiedCodes.has(objective.code)).length;
                const coverage = subject.counts.objectives
                  ? Math.round((studied / subject.counts.objectives) * 100)
                  : 0;
                const values = subject.objectives.map((objective) => mastery.get(objective.id) ?? 0);
                const average = values.length
                  ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
                  : 0;
                const spent = minutes.get(subject.subjectCode) ?? 0;

                return (
                  <li key={subject.enrollmentId}>
                    <Meter
                      value={coverage}
                      label={`${subject.subjectCode} ${subject.subjectName}`}
                      hint={`${studied}/${subject.counts.objectives} objectives - mastery ${average}% - ${spent} min logged`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Mistake tags" description={`${open} still open, ${mistakes.length} logged in total.`}>
            {tagCounts.size === 0 ? (
              <p className="text-caption text-secondary">Nothing logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {TAG_ORDER.filter((tag) => tagCounts.has(tag)).map((tag) => (
                  <li key={tag} className="flex items-center justify-between gap-3">
                    <span className="text-[0.875rem] text-secondary">{tag}</span>
                    <span className="text-caption text-muted tabular">{tagCounts.get(tag)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Marked work" description="Average against marks available.">
            {marked.length === 0 ? (
              <p className="text-caption text-secondary">No assessment has been marked yet.</p>
            ) : (
              <ul className="divide-y divide-subtle">
                {marked.map((assessment) => (
                  <li key={assessment.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate text-[0.875rem] text-secondary">{assessment.title}</span>
                    <Status tone="success">
                      {assessment.totalMarks ? `${assessment.totalMarks} marks` : "Marked"}
                    </Status>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Panel title="Extraction status" description="A draft package is not exam-safe until its PDF is parsed.">
          {subjects.length === 0 ? (
            <p className="text-caption text-secondary">No enrolled subjects to report on.</p>
          ) : (
            <ul className="divide-y divide-subtle">
              {subjects.map((subject) => (
                <li key={subject.enrollmentId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="text-[0.8125rem] text-secondary">
                    {subject.subjectCode} - {subject.versionLabel}
                  </span>
                  <Status tone={subject.versionStatus === "active" ? "success" : "warning"}>
                    {subject.versionStatus === "active" ? "Verified" : "Draft"}
                  </Status>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Callout tone="warning" title="Before the exam entry">
          Only subjects with a private-candidate route can be entered. The sciences use the alternative-to-practical
          paper, and Global Perspectives stays out because it needs school-authenticated coursework.
        </Callout>
      </div>
    </>
  );
}
