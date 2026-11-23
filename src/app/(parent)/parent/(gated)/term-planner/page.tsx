import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { TermPlanner } from "@/components/parent/TermPlanner";
import { EmptyState, PageHeading } from "@/components/ui/primitives";
import { examSeriesMonths, examSeriesYears, seriesLabel } from "@/lib/config/site";
import { todayIso } from "@/lib/data/dates";
import { getEnrollments, getRouteOptions } from "@/lib/data/enrollments";
import { getSetupState } from "@/lib/data/session";
import { getTerms } from "@/lib/data/terms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Term planner" };

const SERIES = examSeriesYears.flatMap((year) => examSeriesMonths.map((month) => seriesLabel(month, year)));

export default async function TermPlannerPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const state = await getSetupState();

  const heading = (
    <PageHeading eyebrow="Term planner" title="Dates, subjects and exams">
      Set the terms, mark the mid-term and final weeks, and choose each subject&apos;s entry route and exam series. The
      learner&apos;s plan, timetable and subjects read the same rows.
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
  if (terms.length === 0) {
    return (
      <>
        {heading}
        <EmptyState title="No terms yet">Create the first term in onboarding, then come back to adjust it here.</EmptyState>
      </>
    );
  }

  const { term: requested } = await searchParams;
  const termId = terms.find((term) => term.id === requested)?.id ?? state.activeTermId ?? terms[0]!.id;

  const [enrollments, options] = await Promise.all([getEnrollments(state.learnerId, termId), getRouteOptions()]);

  return (
    <>
      {heading}
      <TermPlanner
        key={termId}
        terms={terms.map((term) => ({
          id: term.id,
          name: term.name,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
          midtermWeekStart: term.midtermWeekStart,
          finalWeekStart: term.finalWeekStart,
          status: term.status,
        }))}
        termId={termId}
        options={options}
        enrollments={enrollments.map((enrollment) => ({
          routeId: enrollment.routeId,
          isElective: enrollment.isElective,
          weeklyMinutes: enrollment.weeklyMinutes,
          targetGrade: enrollment.targetGrade,
          targetExamSeries: enrollment.targetExamSeries,
        }))}
        seriesOptions={SERIES}
        defaultSeries={state.examSeries}
        today={todayIso()}
      />
    </>
  );
}
