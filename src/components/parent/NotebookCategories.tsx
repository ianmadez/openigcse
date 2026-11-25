"use client";

import { Save, Tag } from "lucide-react";
import { useState, useTransition } from "react";

import { recategoriseMistakeAction } from "@/app/(parent)/parent/(gated)/marking-desk/actions";
import { ActionButton } from "@/components/ui/Button";
import { EmptyState, Status } from "@/components/ui/primitives";
import { ERROR_TAGS } from "@/lib/assessment/marking";
import type { ErrorTag, Mistake } from "@/lib/data/mistakes";

/**
 * The learner picks their own reason when they add a checkpoint to the notebook; this is where a
 * parent corrects it (Step 4.2).
 */
export function NotebookCategories({ items }: { items: Mistake[] }) {
  const [choices, setChoices] = useState<Record<string, ErrorTag>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.errorTag])),
  );
  const [saved, setSaved] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return <EmptyState title="Nothing open">Mistakes from marking and checkpoints appear here until they are resolved.</EmptyState>;
  }

  const save = (id: string) => {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const result = await recategoriseMistakeAction({ id, category: choices[id] ?? "ConceptGap" }).catch(() => ({
        ok: false as const,
        error: "The server could not be reached.",
      }));
      if (result.ok) setSaved((list) => (list.includes(id) ? list : [...list, id]));
      else setError({ id, message: result.error });
      setBusy(null);
    });
  };

  return (
    <ul className="divide-y divide-subtle">
      {items.map((item) => (
        <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip tabular">{item.objectiveCode}</span>
            <Status tone={item.source === "student" ? "info" : "neutral"}>
              {item.source === "student" ? "Learner added" : "Marked"}
            </Status>
            {saved.includes(item.id) && <Status tone="success">Reason changed</Status>}
          </div>

          <p className="mt-1.5 line-clamp-2 text-caption leading-relaxed text-secondary">{item.note}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-caption text-secondary">
              <Tag aria-hidden="true" className="size-3.5" strokeWidth={2} />
              <span className="sr-only">Reason for {item.objectiveCode}</span>
              <select
                value={choices[item.id] ?? item.errorTag}
                onChange={(event) =>
                  setChoices((current) => ({ ...current, [item.id]: event.target.value as ErrorTag }))
                }
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
              pending={pending && busy === item.id}
              pendingLabel="Saving"
              variant="secondary"
              onClick={() => save(item.id)}
              icon={<Save aria-hidden="true" className="size-3.5" strokeWidth={2.2} />}
            >
              Save reason
            </ActionButton>
          </div>

          {error?.id === item.id && (
            <p role="alert" className="mt-1.5 text-caption text-danger-text">
              Not saved: {error.message}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
