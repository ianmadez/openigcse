import Link from "next/link";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { QuestionEditor } from "@/components/parent/QuestionEditor";
import { EmptyState, PageHeading } from "@/components/ui/primitives";
import { getSetupState } from "@/lib/data/session";

import { questionContext } from "../context";

export const dynamic = "force-dynamic";
export const metadata = { title: "New question" };

export default async function NewQuestionPage() {
  const state = await getSetupState();
  const heading = (
    <PageHeading eyebrow="Question bank" title="New question">
      Tag it to one syllabus objective so marks feed that objective&apos;s mastery. <Link href="/parent/questions" className="text-accent-text underline">Back to the bank</Link>
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

  const { tree, assessmentObjectives } = await questionContext(state.learnerId, state.activeTermId);

  return (
    <>
      {heading}
      {tree.length === 0 ? (
        <EmptyState title="No enrolled subjects">
          Questions are tagged to objectives from the learner&apos;s enrolled syllabuses. Enrol a subject in the term planner
          first.
        </EmptyState>
      ) : (
        <QuestionEditor initial={null} tree={tree} assessmentObjectives={assessmentObjectives} />
      )}
    </>
  );
}
