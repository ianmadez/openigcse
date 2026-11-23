"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";

import { approveCorrectionAction } from "@/app/(parent)/parent/(gated)/correction-actions";
import { ActionButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/primitives";
import type { Mistake } from "@/lib/data/mistakes";

/** Written corrections the learner sent for mistakes that have no question to retry. */
export function CorrectionQueue({ items }: { items: Mistake[] }) {
  const [approved, setApproved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const waiting = items.filter((item) => !approved.includes(item.id));

  if (waiting.length === 0) {
    return <EmptyState title="No corrections waiting">The learner's written corrections appear here for you to accept.</EmptyState>;
  }

  const approve = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await approveCorrectionAction(id);
      if (result.ok) setApproved((list) => [...list, id]);
      else setError(result.error);
    });
  };

  return (
    <>
      <ul className="divide-y divide-subtle">
        {waiting.map((item) => (
          <li key={item.id} className="py-3 first:pt-0 last:pb-0">
            <p className="chip tabular inline-block">{item.objectiveCode}</p>
            <p className="mt-2 text-caption text-muted">Question: {item.questionSnapshot}</p>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-primary">{item.correction}</p>
            <ActionButton
              type="button"
              pending={pending}
              pendingLabel="Saving"
              variant="secondary"
              onClick={() => approve(item.id)}
              icon={<Check aria-hidden="true" className="size-3.5" strokeWidth={2.4} />}
              className="mt-2"
            >
              Accept correction
            </ActionButton>
          </li>
        ))}
      </ul>
      <p role="alert" className={error ? "mt-3 text-caption text-danger-text" : "sr-only"}>
        {error ?? ""}
      </p>
    </>
  );
}
