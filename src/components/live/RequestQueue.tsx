"use client";

import { Hand } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { decideRequestAction } from "@/app/(parent)/parent/(gated)/request-actions";
import { Status } from "@/components/ui/primitives";
import { applyRequestChange, type RequestRow, type StudyRequest } from "@/lib/requests/row";
import { decisionLabel, REQUESTS } from "@/lib/requests/catalog";
import { useRealtime } from "@/lib/live/useRealtime";
import { cn } from "@/lib/utils/cn";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * The guardian's one-tap answers (Step 5.1). New asks arrive over Realtime and refresh the list;
 * an answer is shown as given only after `decide_request()` accepted it.
 */
export function RequestQueue({ householdId, requests, showRecent = true }: { householdId: string; requests: StudyRequest[]; showRecent?: boolean }) {
  const [list, setList] = useState(requests);
  useEffect(() => setList(requests), [requests]);

  // The payload is the row, so it is shown as is. No router refresh: Next queues the parent's
  // next answer behind an in-flight refresh, which the exit gate measured as seconds of delay.
  useRealtime(`requests:${householdId}:queue`, "requests", `household_id=eq.${householdId}`, (change) => {
    setList((current) => applyRequestChange(current, (change.new ?? change.old) as RequestRow, change.eventType));
  });

  const pending = list.filter((request) => request.status === "pending");
  const recent = list.filter((request) => request.status !== "pending").slice(0, 3);

  return (
    <div className="space-y-2">
      {pending.length > 0 && (
        <p className="text-caption font-medium text-warning-text" role="status">
          {pending.length} waiting for an answer
        </p>
      )}
      {pending.length === 0 && (
        <p className="flex items-center gap-2 rounded-panel border border-subtle bg-sunken p-3 text-caption text-muted">
          <Hand aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
          No open requests. A new ask appears here the moment it is sent.
        </p>
      )}
      {pending.map((request) => (
        <PendingRequest key={request.id} request={request} />
      ))}
      {showRecent && recent.length > 0 && (
        <ul className="space-y-1 pt-1">
          {recent.map((request) => (
            <li key={request.id} className="flex items-center justify-between gap-2 text-caption text-muted">
              <span className="min-w-0 truncate">
                {REQUESTS[request.type].label}
                {request.studentNote ? `: ${request.studentNote}` : ""}
              </span>
              <span className="shrink-0">
                {request.status === "expired" ? "Expired" : request.status === "declined" ? `Declined (${decisionLabel(request.type, request.decision)})` : decisionLabel(request.type, request.decision)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingRequest({ request }: { request: StudyRequest }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const spec = REQUESTS[request.type];

  const answer = (decision: string) => {
    setError(null);
    setChosen(decision);
    startTransition(async () => {
      const result = await decideRequestAction({ id: request.id, decision, note: note || undefined }).catch(() => ({
        ok: false as const,
        error: "The server could not be reached.",
      }));
      if (!result.ok) {
        setError(result.error);
        setChosen(null);
        return;
      }
      if (request.type === "check_work") router.push("/parent");
      router.refresh();
    });
  };

  return (
    <article className="rounded-panel border border-warning/40 bg-warning-soft/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.9375rem] font-semibold text-primary">{spec.ask}</p>
        <Status tone="warning">{timeFormat.format(new Date(request.createdAt))}</Status>
      </div>
      {request.studentNote && <p className="mt-1 text-[0.875rem] text-secondary">&ldquo;{request.studentNote}&rdquo;</p>}
      {request.type === "swap" && <p className="mt-1 text-caption text-muted">Approving swaps the two periods on today&apos;s plan.</p>}
      {request.type === "day_off" && <p className="mt-1 text-caption text-muted">Approving marks today as a sick day; unfinished work moves to the next school day.</p>}
      <input
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, 300))}
        placeholder="Reply (optional)"
        aria-label="Reply to the learner"
        className="field mt-2 w-full"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {spec.decisions.map((decision) => (
          <button
            key={decision.value}
            type="button"
            disabled={pending}
            onClick={() => answer(decision.value)}
            className={cn(decision.approves ? "btn-primary" : "btn-secondary", "pressable px-3 py-1.5 text-[0.875rem]", pending && chosen === decision.value && "opacity-70")}
          >
            {pending && chosen === decision.value ? "Sending" : decision.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-caption text-danger-text">
          Not answered: {error}
        </p>
      )}
    </article>
  );
}
