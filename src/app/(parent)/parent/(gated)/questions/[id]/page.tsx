import Link from "next/link";
import { notFound } from "next/navigation";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { QuestionEditor } from "@/components/parent/QuestionEditor";
import { Callout, PageHeading } from "@/components/ui/primitives";
import { describeObjectives } from "@/lib/data/objectives";
import { getQuestion } from "@/lib/data/question-bank";
import { getSetupState } from "@/lib/data/session";

import { questionContext } from "../context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit question" };

export default async function EditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const state = await getSetupState();
  const heading = (
    <PageHeading eyebrow="Question bank" title="Edit question">
      <Link href="/parent/questions" className="text-accent-text underline">
        Back to the bank
      </Link>
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

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [question, context] = await Promise.all([getQuestion(id), questionContext(state.learnerId, state.activeTermId)]);
  if (!question) notFound();

  // A question tagged to a subject the learner has since dropped still opens.
  let tree = context.tree;
  if (!tree.some((subject) => subject.topics.some((topic) => topic.objectives.some((objective) => objective.id === question.objectiveId)))) {
    const label = (await describeObjectives([question.objectiveId])).get(question.objectiveId);
    if (label) {
      tree = [
        ...tree,
        {
          subjectCode: label.subjectCode,
          subjectName: `${label.subjectName} (not enrolled)`,
          versionId: label.versionId,
          topics: [{ code: label.topicCode, name: label.topicName, objectives: [{ id: label.id, code: label.code, title: label.title }] }],
        },
      ];
    }
  }

  const { saved } = await searchParams;

  return (
    <>
      {heading}
      {saved && (
        <div className="mb-4">
          <Callout tone="success" title="Question saved">
            It is in the bank and can be added to an assessment.
          </Callout>
        </div>
      )}
      <QuestionEditor initial={question} tree={tree} assessmentObjectives={context.assessmentObjectives} />
    </>
  );
}
