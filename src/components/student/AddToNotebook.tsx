"use client";

import { BookPlus, Check, Tag } from "lucide-react";
import { useState, useTransition } from "react";

import { ActionButton } from "@/components/ui/Button";
import { ERROR_TAGS } from "@/lib/assessment/marking";
import type { ErrorTag } from "@/lib/data/mistakes";

/**
 * Offered under a wrong checkpoint (Step 4.2). The learner picks the reason; a parent can change
 * it later on the marking desk. The entry only appears after the server accepted it.
 */
export function AddToNotebook({
  onAdd,
}: {
  onAdd: (category: ErrorTag) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [category, setCategory] = useState<ErrorTag>("ConceptGap");
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (added) {
    return (
      <p role="status" className="mt-2 flex items-center gap-1.5 text-caption text-success-text">
        <Check aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
        In your notebook. A parent can change the reason.
      </p>
    );
  }

  const add = () => {
    setError(null);
    startTransition(async () => {
      const result = await onAdd(category).catch(() => ({ ok: false as const, error: "The server could not be reached." }));
      if (result.ok) setAdded(true);
      else setError(result.error);
    });
  };

  return (
    <div className="mt-2 rounded-panel border border-subtle bg-sunken p-2.5">
      <label className="flex flex-wrap items-center gap-2 text-caption text-secondary">
        <Tag aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
        <span className="font-medium text-primary">Why did you get it wrong?</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as ErrorTag)}
          className="rounded-lg border border-strong bg-card px-2 py-1 text-caption text-primary"
        >
          {ERROR_TAGS.map((tag) => (
            <option key={tag.value} value={tag.value}>
              {tag.label}
            </option>
          ))}
        </select>
      </label>
      <ActionButton
        type="button"
        pending={pending}
        pendingLabel="Adding"
        variant="secondary"
        onClick={add}
        icon={<BookPlus aria-hidden="true" className="size-3.5" strokeWidth={2.2} />}
        className="mt-2"
      >
        Add to my notebook
      </ActionButton>
      {error && (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">
          Not saved: {error}
        </p>
      )}
    </div>
  );
}
