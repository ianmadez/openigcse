"use client";

import { Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { raiseRequestAction } from "@/app/(student)/request-actions";
import { useRealtime } from "@/lib/live/useRealtime";

/**
 * "Need 20 more minutes on this test" (Step 5.1). When the parent approves, the sitting's extra
 * minutes change in Postgres and the page re-reads its clock.
 */
export function MoreTimeButton({ learnerId, assessmentId, extraMinutes }: { learnerId: string; assessmentId: string; extraMinutes: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "waiting" | "approved" | "declined">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useRealtime(`more-time:${assessmentId}`, "requests", `student_id=eq.${learnerId}`, (change) => {
    const row = change.new as Record<string, unknown>;
    if (row?.request_type !== "more_time" || row.term_assessment_id !== assessmentId || row.status === "pending") return;
    setState(row.status === "approved" ? "approved" : "declined");
    if (row.status === "approved") router.refresh();
  }, "UPDATE");

  const ask = () => {
    setError(null);
    startTransition(async () => {
      const result = await raiseRequestAction({ type: "more_time", termAssessmentId: assessmentId, minutes: 20 }).catch(() => ({
        ok: false as const,
        error: "The server could not be reached.",
      }));
      if (result.ok) setState("waiting");
      else setError(result.error);
    });
  };

  if (state === "waiting") return <span className="text-caption text-muted" role="status">Asked for 20 more minutes</span>;
  if (state === "approved") return <span className="text-caption text-success-text" role="status">20 more minutes added</span>;
  if (state === "declined") return <span className="text-caption text-muted" role="status">No extra time this time</span>;

  return (
    <span className="flex flex-col items-start">
      <button type="button" onClick={ask} disabled={pending || extraMinutes >= 120} className="btn-ghost pressable px-2 py-1 text-caption">
        <Hourglass aria-hidden="true" className="size-3.5" strokeWidth={2} />
        {pending ? "Asking" : "Ask for more time"}
      </button>
      {error && (
        <span role="alert" className="text-caption text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}
