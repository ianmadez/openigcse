import { AlarmClock, NotebookPen } from "lucide-react";
import Link from "next/link";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { DueReviews } from "@/components/student/DueReviews";
import { MistakeList } from "@/components/student/MistakeList";
import { Callout, EmptyState, PageHeading, Panel } from "@/components/ui/primitives";
import { countOpen, getMistakes } from "@/lib/data/mistakes";
import { getCheckpoints } from "@/lib/data/questions";
import { getDueReviews } from "@/lib/data/retention";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Review" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Spaced review" title="Review">
          Objectives due for recall, and the mistakes waiting to be fixed.
        </PageHeading>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const { tab } = await searchParams;
  const active = tab === "notebook" ? "notebook" : "due";
  const now = new Date();

  const [{ items: due, pendingError }, mistakes] = await Promise.all([
    getDueReviews(state.learnerId, now),
    getMistakes(state.learnerId),
  ]);

  const objectiveCodeById = new Map(due.map((item) => [item.objectiveId, item.objectiveCode]));
  const checkpoints = due.length > 0 ? await getCheckpoints([...objectiveCodeById.keys()], objectiveCodeById) : [];
  const checkpointByCode = new Map(checkpoints.map((checkpoint) => [checkpoint.objectiveCode, checkpoint]));
  const rows = due.map((item) => ({ ...item, checkpoint: checkpointByCode.get(item.objectiveCode) ?? null }));
  const open = countOpen(mistakes);

  return (
    <>
      <PageHeading eyebrow="Spaced review" title="Review">
        Objectives the schedule says to recall now, and the mistakes you have already made. Clearing these is the
        cheapest way to win marks back.
      </PageHeading>

      <div role="tablist" aria-label="Review" className="mb-5 flex gap-1 rounded-lg bg-sunken p-1">
        <Link
          role="tab"
          aria-selected={active === "due"}
          href="/review?tab=due"
          className="tab-btn pressable"
        >
          <AlarmClock aria-hidden="true" className="size-3.5" strokeWidth={2} />
          Due for review ({due.length})
        </Link>
        <Link
          role="tab"
          aria-selected={active === "notebook"}
          href="/review?tab=notebook"
          className="tab-btn pressable"
        >
          <NotebookPen aria-hidden="true" className="size-3.5" strokeWidth={2} />
          Mistake notebook ({open})
        </Link>
      </div>

      {active === "due" ? (
        <Panel
          title="Due for review"
          description="Each card moves on its own: a right answer pushes it out, a wrong one brings it back."
        >
          {pendingError && (
            <div className="mb-3">
              <Callout tone="warning" title="The review schedule did not update">
                {pendingError} The answers are still saved; the schedule catches up on the next review.
              </Callout>
            </div>
          )}
          <DueReviews items={rows} nowIso={now.toISOString()} />
        </Panel>
      ) : (
        <>
          {mistakes.length === 0 ? (
            <EmptyState title="Nothing in the notebook yet">
              A mistake lands here when a mark is deducted at the marking desk, or when you add a checkpoint you got
              wrong. Until then there is nothing to clear.
            </EmptyState>
          ) : (
            <>
              <div className="mb-5">
                <Callout tone={open > 0 ? "warning" : "success"} title={`${open} open ${open === 1 ? "mistake" : "mistakes"}`}>
                  {open > 0
                    ? "Each one was tagged when a mark was deducted, or when you added it yourself. Fix the note, then mark it resolved."
                    : "Every mistake in the notebook has been resolved. It comes back if the same objective slips again."}
                </Callout>
              </div>

              <Panel title="Mistake notebook" description="Grouped exactly as they were written.">
                <MistakeList mistakes={mistakes} />
              </Panel>
            </>
          )}
        </>
      )}
    </>
  );
}
