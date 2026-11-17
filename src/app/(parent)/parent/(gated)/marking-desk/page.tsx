import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { MarkingDesk } from "@/components/parent/MarkingDesk";
import { Callout, EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { getTermAssessments } from "@/lib/data/assessments";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { getCheckpoints } from "@/lib/data/questions";
import { getSetupState } from "@/lib/data/session";
import { getTriviaModules } from "@/lib/data/trivia";

export const dynamic = "force-dynamic";

export const metadata = { title: "Marking desk" };

export default async function MarkingDeskPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Marking desk" title="Mark work and log mistakes">
          Every deducted mark can become a notebook entry in one click.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const [assessments, subjects, trivia] = await Promise.all([
    state.activeTermId ? getTermAssessments(state.activeTermId) : Promise.resolve([]),
    state.activeTermId ? getEnrolledCurriculum(state.learnerId, state.activeTermId) : Promise.resolve([]),
    getTriviaModules(),
  ]);

  const objectiveCodeById = new Map<string, string>();
  for (const subject of subjects) {
    for (const objective of subject.objectives) objectiveCodeById.set(objective.id, objective.code);
  }

  const checkpoints = await getCheckpoints([...objectiveCodeById.keys()], objectiveCodeById);
  const marking = assessments.filter((assessment) => assessment.status === "submitted" || assessment.status === "scheduled");

  return (
    <>
      <PageHeading eyebrow="Marking desk" title="Mark work and log mistakes">
        Every deducted mark can become a notebook entry in one click. The student then has to fix it in their next study
        block.
      </PageHeading>

      <div className="mb-5">
        <Callout tone="neutral" title="Reading the real rows">
          Assessments come from the term on file and checkpoints from the question bank. Both are empty until the
          assessment builder and question editor ship, which is why the sheet below has nothing to mark yet.
        </Callout>
      </div>

      {marking.length === 0 || checkpoints.length === 0 ? (
        <EmptyState title="Nothing to mark yet">
          A sitting needs a scheduled assessment and at least one checkpoint on the objectives it covers. Add both and
          this sheet fills in.
        </EmptyState>
      ) : (
        <MarkingDesk assessments={assessments} checkpoints={checkpoints} />
      )}

      <div className="mt-6">
        <Panel
          title="Trivia modules"
          description="Documentaries with timestamped checkpoints, published to the learner's Trivia page."
          action={
            <Status tone={trivia.length > 0 ? "success" : "neutral"}>
              {trivia.length === 0 ? "None published" : `${trivia.length} published`}
            </Status>
          }
        >
          {trivia.length === 0 ? (
            <p className="text-caption text-secondary">
              No modules in the trivia tables yet. Authoring a module writes to trivia_modules and trivia_questions; the
              form for that arrives with the question bank editor.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-subtle">
                {trivia.map((module) => (
                  <li key={module.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] text-primary">{module.title}</span>
                      <span className="block text-caption text-muted">
                        {module.topicArea} - {module.provider} - {module.questions.length} checkpoints
                      </span>
                    </span>
                    <Link href={`/trivia/${module.id}`} className="btn-secondary pressable">
                      <Clapperboard aria-hidden="true" className="size-3.5" strokeWidth={2} />
                      Preview
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-caption text-muted">
                Adding a module writes to trivia_modules and trivia_questions. The form for that lands with the question
                bank editor.
              </p>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
