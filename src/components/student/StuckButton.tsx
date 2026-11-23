"use client";

import { LifeBuoy } from "lucide-react";
import { useState } from "react";

import { flagStuckAction } from "@/app/(student)/learning-actions";

/** Raises a flag for the parent without touching the streak. */
export function StuckButton({ objectiveCode }: { objectiveCode: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setState("sending");
    setError(null);
    const result = await flagStuckAction({ objectiveCode }).catch(() => ({
      ok: false as const,
      error: "The server could not be reached.",
    }));
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
        Asked. Your parent will see this before the next block. Your streak is untouched.
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
