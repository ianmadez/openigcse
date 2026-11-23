"use client";

import { Check, Tag } from "lucide-react";
import { useState, useTransition } from "react";

import { resolveMistakeAction } from "@/app/(student)/review/actions";
import { ActionButton } from "@/components/ui/Button";
import { EmptyState, Status } from "@/components/ui/primitives";
import { ERROR_TAGS } from "@/lib/assessment/marking";
import type { Mistake } from "@/lib/data/mistakes";
import { cn } from "@/lib/utils/cn";

const tagTone = {
  ConceptGap: "danger",
  CommandWordMisread: "warning",
  CalculationSlip: "info",
  IncompleteExplanation: "neutral",
  TimePressure: "neutral",
} as const;

export function MistakeList({ mistakes }: { mistakes: Mistake[] }) {
  const [resolved, setResolved] = useState<string[]>(
    mistakes.filter((mistake) => mistake.status === "resolved").map((mistake) => mistake.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (mistakes.length === 0) {
    return (
      <EmptyState title="Nothing in the notebook">
        Mistakes appear here when a mark is deducted at the marking desk.
      </EmptyState>
    );
  }

  const resolve = (id: string) => {
    setError(null);
    setResolved((items) => [...items, id]);

    startTransition(async () => {
      const result = await resolveMistakeAction(id);
      if (!result.ok) {
        setResolved((items) => items.filter((item) => item !== id));
        setError(result.error);
      }
    });
  };

  return (
    <>
      <ul className="divide-y divide-subtle">
        {mistakes.map((mistake) => {
          const done = resolved.includes(mistake.id);

          return (
            <li key={mistake.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip tabular">{mistake.objectiveCode}</span>
                <Status tone={tagTone[mistake.errorTag]}>
                  <Tag aria-hidden="true" className="size-3" strokeWidth={2.2} />
                  {ERROR_TAGS.find((tag) => tag.value === mistake.errorTag)?.label ?? mistake.errorTag}
                </Status>
                {done && <Status tone="success">Resolved</Status>}
              </div>

              <p
                className={cn(
                  "mt-2 text-[0.875rem] leading-relaxed",
                  done ? "text-muted line-through" : "text-secondary",
                )}
              >
                {mistake.note}
              </p>

              {!done && (
                <ActionButton
                  type="button"
                  pending={pending}
                  pendingLabel="Saving"
                  variant="secondary"
                  onClick={() => resolve(mistake.id)}
                  icon={<Check aria-hidden="true" className="size-3.5" strokeWidth={2.4} />}
                  className="mt-2.5"
                >
                  Mark as fixed
                </ActionButton>
              )}
            </li>
          );
        })}
      </ul>

      <p role="status" aria-live="polite" className={error ? "mt-3 text-caption text-danger-text" : "sr-only"}>
        {error ?? "Mistake updated"}
      </p>
    </>
  );
}
