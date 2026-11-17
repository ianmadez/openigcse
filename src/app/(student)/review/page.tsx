import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { MistakeList } from "@/components/student/MistakeList";
import { Callout, EmptyState, PageHeading, Panel } from "@/components/ui/primitives";
import { countOpen, getMistakes } from "@/lib/data/mistakes";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Review" };

export default async function ReviewPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Spaced review" title="Review">
          Mistakes recorded at the marking desk, waiting to be cleared.
        </PageHeading>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const mistakes = await getMistakes(state.learnerId);
  const open = countOpen(mistakes);

  return (
    <>
      <PageHeading eyebrow="Spaced review" title="Review">
        Mistakes you have already made are the cheapest marks to win back. Clear these before new material.
      </PageHeading>

      {mistakes.length === 0 ? (
        <EmptyState title="Nothing in the notebook yet">
          A mistake lands here when a mark is deducted at the marking desk. Until then there is nothing to clear.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5">
            <Callout tone={open > 0 ? "warning" : "success"} title={`${open} open ${open === 1 ? "mistake" : "mistakes"}`}>
              {open > 0
                ? "Each one was tagged when a mark was deducted. Fix the note, then mark it resolved."
                : "Every mistake in the notebook has been resolved. It comes back if the same objective slips again."}
            </Callout>
          </div>

          <Panel title="Mistake notebook" description="Grouped exactly as the marking desk wrote them.">
            <MistakeList mistakes={mistakes} />
          </Panel>
        </>
      )}
    </>
  );
}
