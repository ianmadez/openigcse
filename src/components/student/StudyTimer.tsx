"use client";

import { Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

type StudyTimerProps = {
  objectiveCode: string;
  plannedMinutes: number;
  onRecorded?: (minutes: number) => void;
};

function format(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Counts real study time and posts it to /api/learning-events, which recalibrates
 * topic pacing. Pausing does not reset the elapsed count.
 */
export function StudyTimer({ objectiveCode, plannedMinutes, onRecorded }: StudyTimerProps) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saved, setSaved] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef<Date | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = () => {
    startedAt.current = startedAt.current ?? new Date();
    setMessage(null);
    setRunning(true);
  };

  const finish = async () => {
    setRunning(false);
    const minutes = Math.max(1, Math.round(seconds / 60));

    try {
      const response = await fetch("/api/learning-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objectiveCode,
          kind: "lesson",
          startedAt: (startedAt.current ?? new Date()).toISOString(),
          minutes,
        }),
      });
      const body = (await response.json()) as { persisted?: boolean; reason?: string };
      setMessage(
        body.persisted ? "Saved to your learning record." : "Saved on this device. Connect the database to sync it.",
      );
    } catch {
      setMessage("Saved on this device. The server could not be reached.");
    }

    setSaved(minutes);
    setSeconds(0);
    startedAt.current = null;
    onRecorded?.(minutes);
  };

  const ratio = Math.min(100, Math.round((seconds / 60 / plannedMinutes) * 100));

  return (
    <div className="rounded-panel border border-subtle bg-sunken p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption text-muted">Study timer</p>
          <p className="text-title font-semibold text-primary tabular">{format(seconds)}</p>
        </div>

        <div className="flex items-center gap-2">
          {!running ? (
            <button type="button" onClick={start} className="btn-secondary pressable">
              <Play aria-hidden="true" className="size-4" strokeWidth={2} />
              {seconds === 0 ? "Start" : "Resume"}
            </button>
          ) : (
            <button type="button" onClick={() => setRunning(false)} className="btn-secondary pressable">
              <Pause aria-hidden="true" className="size-4" strokeWidth={2} />
              Pause
            </button>
          )}
          <button
            type="button"
            onClick={finish}
            disabled={seconds === 0}
            className="btn-primary pressable disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
            Finish
          </button>
        </div>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-inset">
        <div className={cn("h-full rounded-full bg-accent")} style={{ width: `${ratio}%` }} />
      </div>

      <p className="mt-1.5 text-caption text-muted" aria-live="polite">
        {message ??
          (saved
            ? `${saved} minutes recorded. Planned block: ${plannedMinutes} minutes.`
            : `Planned block: ${plannedMinutes} minutes.`)}
      </p>
    </div>
  );
}
