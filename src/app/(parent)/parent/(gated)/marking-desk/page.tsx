import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { MarkingDesk } from "@/components/parent/MarkingDesk";
import { NotebookCategories } from "@/components/parent/NotebookCategories";
import { EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { KIND_NAME } from "@/lib/assessment/builder";
import { getMarkingQueue, getMarkingSheet } from "@/lib/data/marking";
import { getMistakes } from "@/lib/data/mistakes";
import { getSetupState } from "@/lib/data/session";
import { getTerms } from "@/lib/data/terms";
import { getTriviaEditorModules } from "@/lib/data/trivia";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

export const metadata = { title: "Marking desk" };

export default async function MarkingDeskPage({ searchParams }: { searchParams: Promise<{ assessment?: string }> }) {
  const state = await getSetupState();
  const heading = (
    <PageHeading eyebrow="Marking desk" title="Mark work and log mistakes">
      Every dropped mark needs a reason, and lands in the learner&apos;s notebook to fix in a later study block.
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
  const [queue, trivia, mistakes] = await Promise.all([
    getMarkingQueue(terms.map((term) => term.id)),
    getTriviaEditorModules(),
    getMistakes(state.learnerId),
  ]);
  const openMistakes = mistakes.filter((mistake) => mistake.status === "open");

  const { assessment: requested } = await searchParams;
  const selectedId =
    requested && /^[0-9a-f-]{36}$/i.test(requested) ? requested : (queue.toMark[0]?.id ?? null);
  const sheet = selectedId ? await getMarkingSheet(selectedId, state.learnerId) : null;

  const queueLink = (assessment: (typeof queue.toMark)[number], label: string) => (
    <li key={assessment.id}>
      <Link
        href={`/parent/marking-desk?assessment=${assessment.id}`}
        aria-current={assessment.id === selectedId ? "page" : undefined}
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-sunken",
          assessment.id === selectedId && "bg-accent-soft",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[0.875rem] text-primary">{assessment.title}</span>
          <span className="block text-caption text-muted tabular">
            {assessment.subjectCode} - {KIND_NAME[assessment.category] ?? assessment.category}
          </span>
        </span>
        <Status tone={label === "To mark" ? "warning" : "success"}>
          {label === "To mark" ? label : `${assessment.studentScore ?? 0}%`}
        </Status>
      </Link>
    </li>
  );

  return (
    <>
      {heading}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Papers" className="space-y-4">
          <div>
            <h2 className="label mb-1.5">To mark ({queue.toMark.length})</h2>
            {queue.toMark.length === 0 ? (
              <p className="text-caption text-secondary">Nothing handed in.</p>
            ) : (
              <ul className="surface divide-y divide-subtle overflow-hidden">{queue.toMark.map((item) => queueLink(item, "To mark"))}</ul>
            )}
          </div>
          {queue.marked.length > 0 && (
            <div>
              <h2 className="label mb-1.5">Recently marked</h2>
              <ul className="surface divide-y divide-subtle overflow-hidden">{queue.marked.map((item) => queueLink(item, "Marked"))}</ul>
            </div>
          )}
        </nav>

        <section aria-label="Mark sheet">
          {sheet ? (
            <>
              <h2 className="mb-3 text-title font-semibold text-primary">{sheet.assessment.title}</h2>
              {sheet.assessment.state === "in_progress" ? (
                <EmptyState title="Still being sat">The learner is working on this paper. It opens for marking once handed in or out of time.</EmptyState>
              ) : sheet.items.length === 0 ? (
                <EmptyState title="No questions on this paper">Add questions in the assessment builder.</EmptyState>
              ) : (
                <MarkingDesk key={`${sheet.assessment.id}-${sheet.assessment.state}`} sheet={sheet} />
              )}
            </>
          ) : (
            <EmptyState title="Nothing to mark yet">
              When the learner hands in a paper it appears on the left. Papers are built in{" "}
              <Link href="/parent/assessments" className="text-accent-text underline">
                Assessments
              </Link>
              .
            </EmptyState>
          )}
        </section>
      </div>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <Panel
          title="Notebook reasons"
          description="The learner chooses a reason when they add a checkpoint; change it here if it is not the real one."
          action={
            <Status tone={openMistakes.length > 0 ? "warning" : "success"}>
              {openMistakes.length === 0 ? "None open" : `${openMistakes.length} open`}
            </Status>
          }
        >
          <NotebookCategories items={openMistakes} />
        </Panel>

        <Panel
          title="Trivia modules"
          description="Documentaries with timestamped checkpoints, published to the learner's Trivia page."
          action={
            <Link href="/parent/trivia" className="btn-secondary pressable">
              <Clapperboard aria-hidden="true" className="size-3.5" strokeWidth={2} />
              Author modules
            </Link>
          }
        >
          {trivia.length === 0 ? (
            <p className="text-caption text-secondary">
              No modules in the trivia tables yet. Add one with a YouTube id and at least one checkpoint.
            </p>
          ) : (
            <ul className="divide-y divide-subtle">
              {trivia.map((module) => (
                <li key={module.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] text-primary">{module.title}</span>
                    <span className="block text-caption text-muted">
                      {module.topicArea} - {module.provider || "no provider"} - {module.questions.length} {module.questions.length === 1 ? "checkpoint" : "checkpoints"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Status tone={module.isPublished ? "success" : "neutral"}>
                      {module.isPublished ? "Published" : "Draft"}
                    </Status>
                    <Link href={`/trivia/${module.id}`} className="btn-secondary pressable">
                      <Clapperboard aria-hidden="true" className="size-3.5" strokeWidth={2} />
                      Preview
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
