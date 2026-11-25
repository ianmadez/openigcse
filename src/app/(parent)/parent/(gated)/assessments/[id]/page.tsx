import Link from "next/link";
import { notFound } from "next/navigation";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { AssessmentBuilder } from "@/components/parent/AssessmentBuilder";
import { PageHeading } from "@/components/ui/primitives";
import { getAssessmentDetail } from "@/lib/data/assessment-builder";
import { todayIso } from "@/lib/data/dates";
import { getSetupState } from "@/lib/data/session";

import { builderContext } from "../context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getSetupState();
  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Assessments" title="Assessment" />
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getAssessmentDetail(id);
  if (!detail) notFound();

  const context = await builderContext(state.householdId, state.learnerId, detail.termId);
  // A question already on the paper stays visible even if the bank filter would hide it.
  const subjects = context.subjects.some((subject) => subject.routeId === detail.routeId)
    ? context.subjects
    : [
        ...context.subjects,
        { routeId: detail.routeId ?? "", subjectCode: detail.subjectCode ?? "", subjectName: detail.subjectName ?? "Not enrolled" },
      ];

  return (
    <>
      <PageHeading eyebrow="Assessments" title={detail.title}>
        <Link href="/parent/assessments" className="text-accent-text underline">
          All assessments
        </Link>
        {(detail.state === "handed_in" || detail.state === "marked") && (
          <>
            {" - "}
            <Link href={`/parent/marking-desk?assessment=${detail.id}`} className="text-accent-text underline">
              Open at the marking desk
            </Link>
          </>
        )}
      </PageHeading>
      <AssessmentBuilder
        key={`${detail.id}-${detail.status}-${detail.items.length}`}
        existing={{
          id: detail.id,
          status: detail.status,
          state: detail.state,
          questionIds: detail.items.map((item) => item.questionId),
          title: detail.title,
          category: detail.category,
          routeId: detail.routeId ?? "",
          scheduledDate: detail.scheduledDate ?? "",
          durationMinutes: detail.durationMinutes,
          thresholds: detail.thresholds,
          paperCode: detail.paperCode ?? "",
          examSeries: detail.examSeries ?? "",
          paperVariant: detail.paperVariant ?? "",
          paperUrl: detail.paperUrl ?? "",
        }}
        subjects={subjects}
        bank={context.bank}
        tree={context.tree}
        zone={context.zone}
        today={todayIso(new Date(), state.timezone)}
      />
    </>
  );
}
