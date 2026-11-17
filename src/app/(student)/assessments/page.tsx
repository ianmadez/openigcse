import Link from "next/link";

import { EmptyState, PageHeading, Status } from "@/components/ui/primitives";
import { KIND_NAME, type SittingState } from "@/lib/assessment/builder";
import { getAuthContext } from "@/lib/auth/session";
import { listAssessments } from "@/lib/data/assessment-builder";
import { getSetupState } from "@/lib/data/session";
import { getTerms } from "@/lib/data/terms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessments" };

const LEARNER_LABEL: Record<SittingState, { label: string; tone: "info" | "warning" | "success" | "neutral" }> = {
  draft: { label: "Not ready", tone: "neutral" },
  scheduled: { label: "Ready to sit", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  handed_in: { label: "Waiting for marks", tone: "neutral" },
  marked: { label: "Marked", tone: "success" },
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function LearnerAssessmentsPage() {
  const [state, context] = await Promise.all([getSetupState(), getAuthContext()]);
  const heading = (
    <PageHeading eyebrow="Assessments" title="Quizzes and tests">
      Papers your parent has set. The timer only starts when you press Start.
    </PageHeading>
  );

  if (state.status !== "configured") return heading;

  // On the learner's own device show their papers; a guardian looking sees the household learner's.
  const learnerId = context?.role === "student" && context.profileId ? context.profileId : state.learnerId;
  const terms = await getTerms(state.householdId);
  const assessments = (await listAssessments(terms.map((term) => term.id))).filter(
    (assessment) => assessment.status !== "Draft" && (!assessment.studentId || assessment.studentId === learnerId),
  );

  const open = assessments.filter((assessment) => assessment.state === "scheduled" || assessment.state === "in_progress");
  const done = assessments.filter((assessment) => assessment.state === "handed_in" || assessment.state === "marked");

  return (
    <>
      {heading}
      {assessments.length === 0 ? (
        <EmptyState title="Nothing set yet">When your parent schedules a quiz or test it appears here.</EmptyState>
      ) : (
        <div className="space-y-6">
          {[
            { title: "To do", rows: open },
            { title: "Done", rows: done },
          ].map((group) =>
            group.rows.length ? (
              <section key={group.title} aria-label={group.title}>
                <h2 className="mb-2 text-heading font-semibold text-primary">{group.title}</h2>
                <ul className="surface divide-y divide-subtle">
                  {group.rows.map((assessment) => (
                    <li key={assessment.id}>
                      <Link
                        href={`/assessments/${assessment.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-sunken focus-visible:bg-sunken"
                      >
                        <span className="min-w-0">
                          <span className="block text-[0.875rem] font-medium text-primary">{assessment.title}</span>
                          <span className="block text-caption text-muted tabular">
                            {assessment.subjectCode} - {KIND_NAME[assessment.category] ?? assessment.category} -{" "}
                            {assessment.durationMinutes} min - {assessment.totalMarks} marks
                            {assessment.scheduledDate ? ` - ${dateFormat.format(new Date(`${assessment.scheduledDate}T00:00:00Z`))}` : ""}
                          </span>
                        </span>
                        <Status tone={LEARNER_LABEL[assessment.state].tone}>
                          {assessment.state === "marked" && assessment.studentScore !== null
                            ? `Marked - ${assessment.studentScore}%`
                            : LEARNER_LABEL[assessment.state].label}
                        </Status>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}
    </>
  );
}
