import { CalendarDays, CheckCircle2, Circle } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { getTermAssessments } from "@/lib/data/assessments";
import { getEnrollments } from "@/lib/data/enrollments";
import { getSetupState } from "@/lib/data/session";
import { getTerms } from "@/lib/data/terms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Plan" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const kindLabel = {
  weekly_quiz: "Weekly quiz",
  topic_test: "Topic test",
  mid_term: "Mid-term",
  final: "Final exam",
  past_paper: "Past paper",
} as const;

export default async function PlanPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Term" title="Plan">
          Terms, enrolments and scheduled assessments, read from the household's own rows.
        </PageHeading>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const [terms, enrollments, assessments] = await Promise.all([
    getTerms(state.householdId),
    state.activeTermId ? getEnrollments(state.learnerId, state.activeTermId) : Promise.resolve([]),
    state.activeTermId ? getTermAssessments(state.activeTermId) : Promise.resolve([]),
  ]);

  const term = state.term;

  return (
    <>
      <PageHeading eyebrow={term?.name ?? "No active term"} title="Plan">
        {term ? (
          <>
            {dateFormat.format(new Date(term.startsOn))} to {dateFormat.format(new Date(term.endsOn))}.
            {term.midtermWeekStart
              ? ` Mid-term week starts ${dateFormat.format(new Date(term.midtermWeekStart))};`
              : ""}
            {term.finalWeekStart ? ` finals start ${dateFormat.format(new Date(term.finalWeekStart))}.` : ""}
          </>
        ) : (
          "No term is running yet. A parent sets the term dates in the term planner."
        )}
      </PageHeading>

      <Panel title="The year" description="Every term on file, in calendar order." className="mb-4">
        <ul className="divide-y divide-subtle">
          {terms.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="block text-[0.875rem] text-primary">{entry.name}</span>
                <span className="block text-caption text-muted">
                  {dateFormat.format(new Date(entry.startsOn))} - {dateFormat.format(new Date(entry.endsOn))}
                </span>
              </span>
              <Status tone={entry.status === "active" ? "success" : entry.status === "completed" ? "neutral" : "warning"}>
                {entry.status === "active" ? "Running" : entry.status === "completed" ? "Finished" : "Upcoming"}
              </Status>
            </li>
          ))}
          {terms.length === 0 && (
            <li className="py-2 text-caption text-muted">No terms are saved for this household.</li>
          )}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Assessments" description="Everything the term planner has scheduled.">
          {assessments.length === 0 ? (
            <EmptyState title="Nothing scheduled">
              Assessments appear here once a parent adds them to this term. Sitting and marking them arrives with the
              marking desk.
            </EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {assessments.map((assessment) => (
                <li key={assessment.id} className="rounded-panel border border-subtle bg-sunken p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.875rem] font-medium text-primary">{assessment.title}</span>
                    <Status tone={assessment.daysUntil <= 7 ? "warning" : "neutral"}>
                      {assessment.daysUntil === 0 ? "Today" : `in ${assessment.daysUntil} days`}
                    </Status>
                  </div>
                  <p className="mt-1 text-caption text-muted">
                    {kindLabel[assessment.kind]} - {dateFormat.format(new Date(assessment.scheduledFor))}
                    {assessment.durationMinutes ? ` - ${assessment.durationMinutes} min` : ""}
                    {assessment.totalMarks ? ` - ${assessment.totalMarks} marks` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="This term" description="Subject load and weekly commitment.">
          {enrollments.length === 0 ? (
            <EmptyState title="No enrolments on this term">
              A parent picks the subjects and entry routes for the term; this list follows that choice.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-subtle">
              {enrollments.map((enrollment) => (
                <li
                  key={enrollment.enrollmentId}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="flex items-center gap-2">
                    {enrollment.isElective ? (
                      <Circle aria-hidden="true" className="size-3.5 text-muted" strokeWidth={2} />
                    ) : (
                      <CheckCircle2 aria-hidden="true" className="size-3.5 text-success" strokeWidth={2} />
                    )}
                    <span className="text-[0.875rem] text-primary">
                      {enrollment.subjectCode} {enrollment.subjectName}
                    </span>
                  </span>
                  <span className="text-caption text-muted tabular">{enrollment.weeklyMinutes} min/wk</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-caption text-muted">
            <CalendarDays aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Change this in the parent term planner.
          </p>
        </Panel>
      </div>
    </>
  );
}
