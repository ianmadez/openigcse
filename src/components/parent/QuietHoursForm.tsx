"use client";

import { Moon } from "lucide-react";
import { useState, useTransition } from "react";

import { saveQuietHoursAction } from "@/app/shell-actions";
import { ActionButton } from "@/components/ui/Button";

/** Quiet hours (Step 5.3): pushes are held in this window; the in-app centre still lists them. */
export function QuietHoursForm({ start, end }: { start: string | null; end: string | null }) {
  const [from, setFrom] = useState(start ?? "");
  const [to, setTo] = useState(end ?? "");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (clear = false) => {
    setResult(null);
    startTransition(async () => {
      const outcome = await saveQuietHoursAction({ start: clear ? null : from || null, end: clear ? null : to || null }).catch(() => ({
        ok: false as const,
        error: "The server could not be reached.",
      }));
      if (outcome.ok) {
        if (clear) {
          setFrom("");
          setTo("");
        }
        setResult({ ok: true, text: clear ? "Quiet hours cleared." : "Saved." });
      } else setResult({ ok: false, text: outcome.error });
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className="label">From</span>
          <input type="time" value={from} onChange={(event) => setFrom(event.target.value)} className="field" />
        </label>
        <label className="grid gap-1.5">
          <span className="label">Until</span>
          <input type="time" value={to} onChange={(event) => setTo(event.target.value)} className="field" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          type="button"
          onClick={() => save()}
          pending={pending}
          disabled={!from || !to}
          pendingLabel="Saving"
          icon={<Moon aria-hidden="true" className="size-4" strokeWidth={2} />}
        >
          Save quiet hours
        </ActionButton>
        {(start || end) && (
          <button type="button" onClick={() => save(true)} disabled={pending} className="btn-secondary pressable">
            Clear
          </button>
        )}
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-caption text-success-text" : "text-caption text-danger-text"}>
          {result.ok ? result.text : `Not saved: ${result.text}`}
        </p>
      )}
    </div>
  );
}
