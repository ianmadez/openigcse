import Link from "next/link";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { AssessmentBuilder } from "@/components/parent/AssessmentBuilder";
import { EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { KIND_NAME, STATE_LABEL, type SittingState } from "@/lib/assessment/builder";
import { listAssessments } from "@/lib/data/assessment-builder";
import { todayIso } from "@/lib/data/dates";
import { getSetupState } from "@/lib/data/session";
import { getTerms } from "@/lib/data/terms";

import { builderContext } from "./context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessments" };

const TONE: Record<SittingState, "neutral" | "info" | "warning" | "success"> = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "warning",
  handed_in: "warning",
  marked: "success",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function AssessmentsPage() {
  const state = await getSetupState();
  const heading = (
    <PageHeading eyebrow="Assessments" title="Quizzes, tests and past papers">
      Build a paper from the question bank, schedule it onto the learner&apos;s day, and mark it at the marking desk.
    </PageHeading>
  );

  if (state.status !== "configured") {
    return (
      <>
        {heading}
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const terms = await getTerms(state.householdId);
  const [assessments, context] = await Promise.all([
    listAssessments(terms.map((term) => term.id)),
    state.activeTermId ? builderContext(state.householdId, state.learnerId, state.activeTermId) : Promise.resolve(null),
  ]);

  return (
    <>
      {heading}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="New assessment" description="Create it, then add questions and schedule it.">
          {!context || context.subjects.length === 0 ? (
            <p className="text-caption text-secondary">
              Enrol the learner in a subject for the running term first, in the term planner.
            </p>
          ) : (
            <AssessmentBuilder existing={null} subjects={context.subjects} bank={[]} tree={[]} zone={context.zone} today={todayIso(new Date(), state.timezone)} />
          )}
        </Panel>

        <section aria-labelledby="all-assessments">
          <h2 id="all-assessments" className="mb-2 text-heading font-semibold text-primary">
            All assessments
          </h2>
          {assessments.length === 0 ? (
            <EmptyState title="None yet">The first one you create appears here.</EmptyState>
          ) : (
            <ul className="surface divide-y divide-subtle">
              {assessments.map((assessment) => (
                <li key={assessment.id}>
                  <Link
                    href={assessment.state === "handed_in" || assessment.state === "marked" ? `/parent/marking-desk?assessment=${assessment.id}` : `/parent/assessments/${assessment.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-sunken focus-visible:bg-sunken"
                  >
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] font-medium text-primary">{assessment.title}</span>
                      <span className="block text-caption text-muted tabular">
                        {assessment.subjectCode ?? "No subject"} - {KIND_NAME[assessment.category] ?? assessment.category} -{" "}
                        {assessment.scheduledDate ? dateFormat.format(new Date(`${assessment.scheduledDate}T00:00:00Z`)) : "No date"} -{" "}
                        {assessment.totalMarks} marks
                        {assessment.studentScore !== null ? ` - scored ${assessment.studentScore}%` : ""}
                      </span>
                    </span>
                    <Status tone={TONE[assessment.state]}>{STATE_LABEL[assessment.state]}</Status>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
