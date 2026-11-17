import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { TriviaPlayer } from "@/components/student/TriviaPlayer";
import { Callout, PageHeading } from "@/components/ui/primitives";
import { getSetupState } from "@/lib/data/session";
import { getTriviaModule } from "@/lib/data/trivia";

export const dynamic = "force-dynamic";

export default async function TriviaModulePage({ params }: { params: Promise<{ documentaryId: string }> }) {
  const { documentaryId } = await params;
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <Link href="/trivia" className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-secondary">
          <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
          All documentaries
        </Link>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const module = await getTriviaModule(documentaryId);
  if (!module) notFound();

  return (
    <>
      <Link href="/trivia" className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-secondary">
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
        All documentaries
      </Link>

      <PageHeading eyebrow={`${module.topicArea} - ${module.provider}`} title={module.title}>
        {module.description}
      </PageHeading>

      <TriviaPlayer module={module} />

      <div className="mt-5">
        <Callout tone="neutral" title="Where these come from">
          Modules live in the trivia tables and are edited from the parent marking desk, so a family can add their own
          without touching code.
        </Callout>
      </div>
    </>
  );
}
