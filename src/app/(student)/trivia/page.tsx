import Link from "next/link";
import { ArrowRight, Clapperboard } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { EmptyState, PageHeading, Status } from "@/components/ui/primitives";
import { getSetupState } from "@/lib/data/session";
import { getTriviaModules } from "@/lib/data/trivia";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trivia" };

const areaTone = {
  Science: "info",
  History: "warning",
  Engineering: "accent",
  Nature: "success",
} as const;

export default async function TriviaPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="General knowledge" title="Trivia and documentaries">
          Short films with checkpoints built in, published from the household's trivia tables.
        </PageHeading>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const modules = await getTriviaModules();

  return (
    <>
      <PageHeading eyebrow="General knowledge" title="Trivia and documentaries">
        Short films with checkpoints built in. Watch one when a study block is done, or when a topic needs a wider
        picture.
      </PageHeading>

      {modules.length === 0 ? (
        <EmptyState title="No modules published yet">
          A parent adds modules from the marking desk. Each one needs a video id and at least one checkpoint.
        </EmptyState>
      ) : (
        <ul className="stagger grid gap-4 sm:grid-cols-2">
          {modules.map((module) => (
            <li key={module.id}>
              <Link href={`/trivia/${module.id}`} className="surface lift group flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Status tone={areaTone[module.topicArea]}>{module.topicArea}</Status>
                  <span className="text-caption text-muted tabular">{module.durationMinutes} min</span>
                </div>

                <div>
                  <h2 className="text-heading font-semibold leading-snug text-primary">{module.title}</h2>
                  <p className="mt-1 line-clamp-3 text-caption leading-relaxed text-secondary">{module.description}</p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-subtle pt-3">
                  <span className="flex items-center gap-1.5 text-caption text-muted">
                    <Clapperboard aria-hidden="true" className="size-3.5" strokeWidth={2} />
                    {module.provider} - {module.questions.length} checkpoints
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 text-muted transition-transform duration-150 group-hover:translate-x-0.5"
                    strokeWidth={2}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
