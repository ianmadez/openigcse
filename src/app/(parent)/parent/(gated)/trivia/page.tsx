import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { TriviaEditor } from "@/components/parent/TriviaEditor";
import { PageHeading } from "@/components/ui/primitives";
import { getSetupState } from "@/lib/data/session";
import { getTriviaEditorModules } from "@/lib/data/trivia";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trivia modules" };

export default async function ParentTriviaPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Parent area" title="Trivia modules">
          Documentaries with timestamped checkpoints, published to the learner&apos;s Trivia page.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const modules = await getTriviaEditorModules();

  return (
    <>
      <PageHeading eyebrow="Parent area" title="Trivia modules">
        A module is one documentary plus the questions it asks at set moments. The learner watches it from{" "}
        <Link href="/trivia" className="text-accent-text underline">
          Trivia
        </Link>
        , and each answer writes a recall event.
      </PageHeading>

      {modules.length === 0 && (
        <p className="mb-4 flex items-start gap-2 text-caption text-secondary">
          <Clapperboard aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          Nothing published yet. Add a video id and at least one checkpoint below.
        </p>
      )}

      <TriviaEditor modules={modules} />
    </>
  );
}
