"use client";

import { LifeBuoy } from "lucide-react";
import { useState } from "react";

import { flagStuckAction } from "@/app/(student)/learning-actions";
import { raiseRequestAction } from "@/app/(student)/request-actions";

/** Raises a flag for the parent without touching the streak. */
export function StuckButton({ objectiveCode, objectiveText, itemId }: { objectiveCode: string; objectiveText?: string; itemId?: string | null }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setState("sending");
    setError(null);
    // The flagged event keeps the learning record; the request asks a parent for a one-tap answer.
    const offline = { ok: false as const, error: "The server could not be reached." };
    const [flag, request] = await Promise.all([
      flagStuckAction({ objectiveCode }).catch(() => offline),
      raiseRequestAction({ type: "stuck", note: objectiveText ? `Stuck on ${objectiveText}`.slice(0, 300) : undefined, dayPlanItemId: itemId ?? null }).catch(() => offline),
    ]);
    const result = !request.ok ? request : flag;
    if (result.ok) setState("sent");
    else {
      setError(`Not sent: ${result.error}`);
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <p
        className="rounded-panel border border-info/40 bg-info-soft px-3 py-2 text-caption text-info-text"
        role="status"
      >
        Asked. Your parent&apos;s answer appears on this screen. Your streak is untouched.
      </p>
    );
  }

  return (
    <>
    <button type="button" onClick={ask} disabled={state === "sending"} className="btn-secondary pressable">
      <LifeBuoy aria-hidden="true" className="size-4" strokeWidth={2} />
      {state === "sending" ? "Sending" : "I am stuck"}
    </button>
    {error && (
      <p role="alert" className="text-caption text-danger-text">
        {error}
      </p>
    )}
    </>
  );
}
