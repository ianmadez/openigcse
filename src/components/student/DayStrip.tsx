"use client";

import { Bell, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { updatePlanItemAction } from "@/app/(parent)/parent/(gated)/timetable/actions";
import { ActionButton } from "@/components/ui/Button";
import { Status } from "@/components/ui/primitives";
import type { DayPlanItem } from "@/lib/data/timetable-shared";
import { cn } from "@/lib/utils/cn";

/**
 * The day, as periods, at the top of /today.
 *
 * The clock is read on the client only after mount, so the server render and
 * the first client render agree. When the minute crosses into a new period the
 * bell plays once and a banner names it — a state change the learner can see
 * even with sound muted.
 */
export function DayStrip({ items }: { items: DayPlanItem[] }) {
  const timed = useMemo(
    () => items.filter((item) => item.startMinutes !== null && item.endMinutes !== null),
    [items],
  );

  const [now, setNow] = useState<number | null>(null);
  const [banner, setBanner] = useState<DayPlanItem | null>(null);
  const lastPeriod = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const date = new Date();
      setNow(date.getHours() * 60 + date.getMinutes());
    };

    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const current = useMemo(() => {
    if (now === null) return null;
    return timed.find((item) => item.startMinutes! <= now && now < item.endMinutes!) ?? null;
  }, [now, timed]);

  const next = useMemo(() => {
    if (now === null) return timed[0] ?? null;
    return timed.find((item) => item.startMinutes! > now) ?? null;
  }, [now, timed]);

  useEffect(() => {
    if (!current || !now) return;
    if (lastPeriod.current === current.id) return;

    const first = lastPeriod.current === null;
    lastPeriod.current = current.id;
    if (first) return;

    setBanner(current);
    void import("cuelume")
      .then(({ play }) => play("attention"))
      .catch(() => undefined);
  }, [current, now]);

  if (timed.length === 0) {
    return null;
  }

  const start = Math.min(...timed.map((item) => item.startMinutes!));
  const end = Math.max(...timed.map((item) => item.endMinutes!));
  const span = Math.max(60, end - start);

  return (
    <section aria-labelledby="day-strip-heading" className="surface mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-2.5">
        <h2 id="day-strip-heading" className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.06em] text-muted">
          <Bell aria-hidden="true" className="size-3.5" strokeWidth={2} />
          Today&apos;s periods
        </h2>

        <p className="text-caption text-muted">
          {current ? (
            <>
              <span className="font-medium text-primary">{current.subjectCode ?? current.title}</span> now, until{" "}
              <span className="tabular">{current.endTime}</span>
            </>
          ) : next ? (
            <>
              Next: <span className="font-medium text-primary">{next.subjectCode ?? next.title}</span> at{" "}
              <span className="tabular">{next.startTime}</span>
            </>
          ) : (
            "Nothing left on the timetable today"
          )}
        </p>
      </div>

      {banner && (
        <div role="status" className="flex items-center justify-between gap-2 border-b border-accent-line bg-accent-soft px-4 py-2 text-caption text-accent-text">
          <span>
            Period change: <strong className="font-semibold">{banner.subjectCode ?? banner.title}</strong> until{" "}
            {banner.endTime}.
          </span>
          <button type="button" onClick={() => setBanner(null)} className="font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="relative px-4 py-3">
        <div className="flex gap-1.5">
          {timed.map((item) => {
            const active = current?.id === item.id;
            const done = item.status === "done";
            const width = ((item.endMinutes! - item.startMinutes!) / span) * 100;

            return (
              <div
                key={item.id}
                style={{ width: `${Math.max(8, width)}%` }}
                className={cn(
                  "min-w-0 rounded-panel border px-2 py-1.5",
                  active
                    ? "border-accent-line bg-accent-soft"
                    : done
                      ? "border-success/40 bg-success-soft"
                      : "border-subtle bg-sunken",
                )}
              >
                <p className="truncate text-[0.6875rem] font-semibold text-primary">
                  {item.subjectCode ?? item.title}
                </p>
                <p className="truncate text-[0.625rem] text-muted tabular">
                  {item.startTime}–{item.endTime}
                </p>
              </div>
            );
          })}
        </div>

        {now !== null && now >= start && now <= end && (
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-px bg-accent"
            style={{ left: `calc(1rem + ${((now - start) / span) * 100}% - 1rem)` }}
          />
        )}
      </div>
    </section>
  );
}

const STATUS_LABEL: Record<DayPlanItem["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  deferred: "Carried over",
  skipped: "Skipped",
};

/** The period list with start/done controls, writing through the plan action. */
export function PeriodList({ items }: { items: DayPlanItem[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (item: DayPlanItem, status: DayPlanItem["status"]) => {
    setPendingId(item.id);
    setError(null);

    void updatePlanItemAction({ id: item.id, status })
      .then((result) => {
        if (!result.ok) setError(result.error ?? "That could not be saved.");
      })
      .finally(() => setPendingId(null));
  };

  return (
    <>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="surface flex flex-wrap items-center gap-3 p-3">
            <span className="w-16 shrink-0 text-caption text-muted tabular">
              {item.startTime ?? `#${index + 1}`}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[0.875rem] font-medium text-primary">
                {item.subjectCode ? `${item.subjectCode} ` : ""}
                {item.title}
              </span>
              <span className="block text-caption text-muted">
                {item.itemType.replace("_", " ")} - {item.plannedMinutes} min
                {item.reasons[0] ? ` - ${item.reasons[0]}` : ""}
                {item.studentReordered ? " - reordered by the learner" : ""}
              </span>
            </span>

            <div className="flex items-center gap-2">
              <Status
                tone={item.status === "done" ? "success" : item.status === "in_progress" ? "accent" : "neutral"}
              >
                {STATUS_LABEL[item.status]}
              </Status>

              {item.status !== "done" && (
                <ActionButton
                  type="button"
                  pending={pendingId === item.id}
                  pendingLabel="Saving"
                  variant="secondary"
                  onClick={() => update(item, item.status === "in_progress" ? "done" : "in_progress")}
                  icon={
                    item.status === "in_progress" ? undefined : (
                      <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
                    )
                  }
                >
                  {item.status === "in_progress" ? "Finish" : "Start"}
                </ActionButton>
              )}
            </div>
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mt-2 text-caption text-danger-text">
          {error}
        </p>
      )}
    </>
  );
}
