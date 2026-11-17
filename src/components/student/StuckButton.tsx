"use client";

import { LifeBuoy } from "lucide-react";
import { useState } from "react";

/** Raises a flag for the parent without touching the streak. */
export function StuckButton({ objectiveCode }: { objectiveCode: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const ask = async () => {
    setState("sending");
    try {
      await fetch("/api/learning-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectiveCode, kind: "stuck", minutes: 0 }),
      });
    } finally {
      setState("sent");
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
    <button type="button" onClick={ask} disabled={state === "sending"} className="btn-secondary pressable">
      <LifeBuoy aria-hidden="true" className="size-4" strokeWidth={2} />
      {state === "sending" ? "Sending" : "I am stuck"}
    </button>
  );
}
