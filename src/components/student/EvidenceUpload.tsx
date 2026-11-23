"use client";

import { Paperclip, Send } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef } from "react";

import { submitEvidenceAction } from "@/app/(student)/evidence/actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { ACCEPT } from "@/lib/storage/rules";

type Option = { id: string; label: string };

export function EvidenceUpload({
  objectives,
  previous,
}: {
  objectives: Option[];
  previous: { id: string; title: string } | null;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [result, action, pending] = useActionState(submitEvidenceAction, null);

  useEffect(() => {
    if (result?.ok) form.current?.reset();
  }, [result]);

  return (
    // Submitted through onSubmit rather than the form's action prop: React resets a form after its
    // action runs, which would wipe the learner's typing when the server refuses a file.
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-3"
    >
      {previous && <input type="hidden" name="previousId" value={previous.id} />}
      <label className="block">
        <span className="label">Title</span>
        <input name="title" required maxLength={120} defaultValue={previous ? `${previous.title} (corrected)` : ""} placeholder="Osmosis practical write-up" className="field mt-1.5" />
      </label>

      <label className="block">
        <span className="label">Objective (optional)</span>
        <select name="objectiveId" defaultValue="" className="field mt-1.5">
          <option value="">Not tagged</option>
          {objectives.map((objective) => (
            <option key={objective.id} value={objective.id}>
              {objective.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="label">Photo or PDF (up to 15 MB)</span>
        <span className="mt-1.5 flex items-center gap-2">
          <Paperclip aria-hidden="true" className="size-4 text-muted" strokeWidth={2} />
          <input name="file" type="file" accept={ACCEPT} className="min-w-0 flex-1 text-caption text-secondary file:mr-2 file:rounded-lg file:border file:border-subtle file:bg-card file:px-2.5 file:py-1.5 file:text-primary" />
        </span>
      </label>

      <label className="block">
        <span className="label">Or write it here</span>
        <textarea name="typedResponse" rows={4} maxLength={20000} className="field mt-1.5" />
      </label>

      <label className="block">
        <span className="label">Note for your parent (optional)</span>
        <input name="notes" maxLength={1000} className="field mt-1.5" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton pending={pending} pendingLabel="Sending" icon={<Send aria-hidden="true" className="size-4" strokeWidth={2} />}>
          {previous ? "Send the corrected version" : "Send for review"}
        </ActionButton>
        <FormMessage result={result} />
      </div>
    </form>
  );
}
