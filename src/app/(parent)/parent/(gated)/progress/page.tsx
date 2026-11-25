import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { Callout, EmptyState, Meter, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { getTermAssessments } from "@/lib/data/assessments";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { isoDate } from "@/lib/data/dates";
import { getLearningEvents, minutesBySubject } from "@/lib/data/events";
import { getObjectiveMastery, getReviewCompliance } from "@/lib/data/mastery";
import { countByTag, countOpen, getMistakes } from "@/lib/data/mistakes";
import { getSetupState } from "@/lib/data/session";
import { readinessOf } from "@/lib/retention/mastery";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

const TAG_ORDER = [
  "ConceptGap",
  "CommandWordMisread",
  "CalculationSlip",
  "IncompleteExplanation",
  "TimePressure",
] as const;

const percent = (value: number) => Math.round(value * 100);

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

  const [subjects, events, mastery, mistakes, assessments, compliance] = await Promise.all([
    state.activeTermId ? getEnrolledCurriculum(state.learnerId, state.activeTermId) : Promise.resolve([]),
    getLearningEvents(state.learnerId, isoDate(-28)),
    getObjectiveMastery(state.learnerId),
    getMistakes(state.learnerId),
    state.activeTermId ? getTermAssessments(state.activeTermId) : Promise.resolve([]),
    getReviewCompliance(state.learnerId),
  ]);

  const masteryById = new Map(mastery.items.map((item) => [item.objectiveId, item]));
  const tagCounts = countByTag(mistakes);
  const open = countOpen(mistakes);
  const minutes = minutesBySubject(events);
  const marked = assessments.filter((assessment) => assessment.status === "marked");
  const scored = marked.filter((assessment) => assessment.score !== null);
  const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length) : null;

  const readiness = subjects.map((subject) => {
    const rows = subject.objectives.map((objective) => masteryById.get(objective.id));
    const coveredRows = rows.filter((row) => row?.covered);
    const covered = coveredRows.length;
    const meanMastery = covered
      ? coveredRows.reduce((sum, row) => sum + (row?.mastery ?? 0), 0) / covered
      : 0;
    const score = readinessOf(covered, subject.objectives.length, meanMastery);
    return {
      subject,
      covered,
      total: subject.objectives.length,
      meanMastery,
      coverage: score.coverage,
      readiness: score.readiness,
      minutes: minutes.get(subject.subjectCode) ?? 0,
    };
  });

  const readinessError = mastery.error ?? compliance.error;

  return (
    <>
      <PageHeading eyebrow={state.term?.name ?? "No active term"} title="How the term is tracking">
        Coverage counts objectives with at least one recorded event. Mastery is computed on every read from those events
        and the review schedule, so it can never sit at a stale value.
      </PageHeading>

      {readinessError && (
        <div className="mb-4">
          <Callout tone="warning" title="Progress is not fully readable">
            {readinessError} Everything else on this page is still live.
          </Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Readiness"
          description="Coverage × the average mastery of the objectives that have evidence."
          action={<Status tone="neutral">Not an official prediction</Status>}
        >
          {readiness.length === 0 ? (
            <EmptyState title="No enrolments yet">
              Readiness is measured against the enrolled papers, so it needs a term with subjects first.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {readiness.map((row) => (
                <li key={row.subject.enrollmentId}>
                  <Meter
                    value={percent(row.readiness)}
                    label={`${row.subject.subjectCode} ${row.subject.subjectName}`}
                    hint={`${percent(row.coverage)}% covered × ${percent(row.meanMastery)}% mastery of covered objectives`}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-caption text-muted">
            This index tracks the household&apos;s own events. It is not a Cambridge grade and not a forecast.
          </p>
        </Panel>

        <div className="space-y-4">
          <Panel title="Assessment average" description="Marked papers this term, as a percentage.">
            {average === null ? (
              <p className="text-caption text-secondary">No paper has a mark recorded yet.</p>
            ) : (
              <div>
                <p className="text-title font-semibold text-primary tabular">{average}%</p>
                <p className="mt-0.5 text-caption text-muted">
                  across {scored.length} marked {scored.length === 1 ? "paper" : "papers"}
                </p>
              </div>
            )}

            {marked.length > 0 && (
              <ul className="mt-3 divide-y divide-subtle">
                {marked.map((assessment) => (
                  <li key={assessment.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate text-[0.875rem] text-secondary">{assessment.title}</span>
                    <Status tone="success">
                      {assessment.score === null ? `${assessment.totalMarks ?? 0} marks` : `${Math.round(assessment.score)}%`}
                    </Status>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Review compliance" description="Scheduled reviews answered by their due date.">
            {compliance.reviews === 0 ? (
              <p className="text-caption text-secondary">
                No review with a due date has been answered yet. The first answer on each objective starts the clock.
              </p>
            ) : (
              <Meter
                value={percent(compliance.onTime / compliance.reviews)}
                label="Reviews answered on time"
                hint={`${compliance.onTime} of ${compliance.reviews} reviews that had a due date`}
              />
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Panel title="Coverage and mastery" description="Objectives with a recorded event, per subject.">
          {readiness.length === 0 ? (
            <EmptyState title="No enrolments yet">
              Coverage is measured against the enrolled papers, so it needs a term with subjects first.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {readiness.map((row) => (
                <li key={row.subject.enrollmentId}>
                  <Meter
                    value={percent(row.coverage)}
                    label={`${row.subject.subjectCode} ${row.subject.subjectName}`}
                    hint={`${row.covered}/${row.total} objectives · mastery ${percent(row.meanMastery)}% · ${row.minutes} min logged`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
