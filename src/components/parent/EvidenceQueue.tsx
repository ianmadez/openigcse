"use client";

import { Check, FileText, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { reviewEvidenceAction } from "@/app/(parent)/parent/(gated)/evidence-actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import type { EvidenceItem } from "@/lib/data/evidence";

type Message = { ok: true; message: string } | { ok: false; error: string } | null;

function Review({ item }: { item: EvidenceItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const last = useRef<(() => void) | null>(null);
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState<Message>(null);

  const decide = (decision: "Approved" | "NeedsCorrection") => {
    last.current = () => decide(decision);
    startTransition(async () => {
      const result = await reviewEvidenceAction({ id: item.id, decision, feedback });
      setMessage(result);
      if (result.ok) router.refresh();
    });
  };

  return (
    <li className="space-y-2 p-4">
      <div className="min-w-0">
        <p className="text-[0.875rem] font-medium text-primary">{item.title}</p>
        <p className="text-caption text-muted">
          {new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          {item.objectiveCode ? ` - ${item.subjectCode} ${item.objectiveCode}` : ""}
          {item.previousId ? " - corrected version" : ""}
        </p>
      </div>
      {item.fileUrl && (
        <a href={item.fileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-caption text-accent-text underline">
          <FileText aria-hidden="true" className="size-3.5" strokeWidth={2} />
          Open the {item.mimeType === "application/pdf" ? "PDF" : "photo"}
        </a>
      )}
      {item.typedResponse && <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-panel bg-sunken p-2.5 text-caption text-primary">{item.typedResponse}</p>}
      {item.notes && <p className="text-caption text-secondary">Learner&apos;s note: {item.notes}</p>}
      <label className="block">
        <span className="label">Feedback</span>
        <input value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={2000} placeholder="Needed if you ask for changes" className="field mt-1.5" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton type="button" pending={pending} onClick={() => decide("Approved")} icon={<Check aria-hidden="true" className="size-4" strokeWidth={2} />}>
          Approve
        </ActionButton>
        <ActionButton type="button" variant="secondary" pending={pending} onClick={() => decide("NeedsCorrection")} icon={<Undo2 aria-hidden="true" className="size-4" strokeWidth={2} />}>
          Request changes
        </ActionButton>
        <FormMessage result={message} onRetry={() => last.current?.()} pending={pending} />
      </div>
    </li>
  );
}

export function EvidenceQueue({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) return <p className="text-caption text-secondary">Nothing waiting for review.</p>;
  return (
    <ul className="-m-4 divide-y divide-subtle">
      {items.map((item) => (
        <Review key={item.id} item={item} />
      ))}
    </ul>
  );
}
