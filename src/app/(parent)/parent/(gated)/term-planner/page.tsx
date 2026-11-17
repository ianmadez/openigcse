import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { TermPlanner } from "@/components/parent/TermPlanner";
import { Callout, EmptyState, PageHeading } from "@/components/ui/primitives";
import { getElectiveOptions, getEnrollments } from "@/lib/data/enrollments";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Term planner" };

export default async function TermPlannerPage() {
  const state = await getSetupState();

  if (state.status !== "configured" || !state.term || !state.activeTermId) {
    return (
      <>
        <PageHeading eyebrow="Term planner" title="Dates, subjects and exams">
          Set the terms, mark the mid-term and final weeks, and choose the elective. The learner's plan page reads the
          same rows.
        </PageHeading>
        {state.status === "configured" ? (
          <EmptyState title="No term is running">
            Create the first term in onboarding, then come back to adjust dates and subjects.
          </EmptyState>
        ) : (
          <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
        )}
      </>
    );
  }

  const [enrollments, electives] = await Promise.all([
    getEnrollments(state.learnerId, state.activeTermId),
    getElectiveOptions(),
  ]);

  return (
    <>
      <PageHeading eyebrow="Term planner" title="Dates, subjects and exams">
        Set the three terms, mark the mid-term and final weeks, and choose the elective. The learner's plan page reads
        the same record.
      </PageHeading>

      <div className="mb-5">
        <Callout tone="warning" title="Draft only: nothing is saved to the database yet">
          These fields load from the term on file and keep your edits in this browser. Writing them back lands with the
          term planner work in Phase 3, so treat a change here as a rehearsal.
        </Callout>
      </div>

      <TermPlanner
        term={state.term}
        enrollments={enrollments.map((enrollment) => ({
          subjectCode: enrollment.subjectCode,
          subjectName: enrollment.subjectName,
          isElective: enrollment.isElective,
          weeklyMinutes: enrollment.weeklyMinutes,
        }))}
        electives={electives.map((subject) => ({ code: subject.code, name: subject.name }))}
      />
    </>
  );
}
