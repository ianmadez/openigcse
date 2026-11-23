"use client";

import { Lock, Save, Unlock } from "lucide-react";

import { Status } from "@/components/ui/primitives";
import { useLocalDraft } from "@/lib/hooks/useLocalDraft";
import { cn } from "@/lib/utils/cn";

type FocusDraft = {
  locked: boolean;
  startTime: string;
  endTime: string;
  sessionCapMinutes: number;
  blockTabSwitching: boolean;
};

const initial: FocusDraft = {
  locked: true,
  startTime: "09:00",
  endTime: "12:00",
  sessionCapMinutes: 45,
  blockTabSwitching: true,
};

export function FocusControls() {
  const draft = useLocalDraft("openigcse.focus", initial);
  const value = draft.value;

  return (
    <div className="space-y-4">
      <div className="surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.9375rem] font-medium text-primary">Device lock</p>
            <p className="mt-0.5 text-caption text-secondary">
              Keeps lessons inside the sandboxed player and records tab switches.
            </p>
          </div>
          <button
            type="button"
            onClick={() => draft.setValue({ ...value, locked: !value.locked })}
            aria-pressed={value.locked}
            className={cn(
              "pressable inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-[0.875rem] font-medium",
              value.locked
                ? "border-success/40 bg-success-soft text-success-text"
                : "border-subtle bg-card text-secondary",
            )}
          >
            {value.locked ? (
              <Lock aria-hidden="true" className="size-4" strokeWidth={2} />
            ) : (
              <Unlock aria-hidden="true" className="size-4" strokeWidth={2} />
            )}
            {value.locked ? "Locked" : "Unlocked"}
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="block text-caption text-muted">Allowed from</span>
            <input
              type="time"
              value={value.startTime}
              onChange={(event) => draft.setValue({ ...value, startTime: event.target.value })}
              className="mt-1 w-full rounded-lg border border-strong bg-card px-2.5 py-2 text-base text-primary focus:border-accent focus:outline-none sm:text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-caption text-muted">Allowed until</span>
            <input
              type="time"
              value={value.endTime}
              onChange={(event) => draft.setValue({ ...value, endTime: event.target.value })}
              className="mt-1 w-full rounded-lg border border-strong bg-card px-2.5 py-2 text-base text-primary focus:border-accent focus:outline-none sm:text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-caption text-muted">Session cap</span>
            <input
              type="number"
              min={15}
              max={120}
              step={5}
              value={value.sessionCapMinutes}
              onChange={(event) => draft.setValue({ ...value, sessionCapMinutes: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-strong bg-card px-2.5 py-2 text-base text-primary tabular focus:border-accent focus:outline-none sm:text-sm"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={value.blockTabSwitching}
            onChange={(event) => draft.setValue({ ...value, blockTabSwitching: event.target.checked })}
            className="size-4"
          />
          <span className="text-[0.875rem] text-secondary">Report every tab switch to this dashboard</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => draft.save(value)} className="btn-primary pressable">
          <Save aria-hidden="true" className="size-4" strokeWidth={2} />
          Save controls
        </button>
        {draft.savedAt && <Status tone="success">Saved at {draft.savedAt}</Status>}
      </div>
    </div>
  );
}
