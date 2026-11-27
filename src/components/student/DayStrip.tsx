"use client";

import { Bell } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const scroller = useRef<HTMLDivElement>(null);

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

  // Keep the current period in view when the strip scrolls.
  useEffect(() => {
    const strip = scroller.current;
    const block = strip?.querySelector<HTMLElement>("[data-active]");
    if (!strip || !block) return;
    strip.scrollLeft = block.offsetLeft - strip.clientWidth / 2 + block.clientWidth / 2;
  }, [current]);

  if (timed.length === 0) {
    return null;
  }

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

      {/* Blocks grow with their length but never shrink below their text; a long day scrolls
          sideways inside the card instead of cutting "09:00-09:45" to "09:0...". */}
      <div ref={scroller} className="scroll-contain overflow-x-auto px-4 py-3">
        <div className="flex gap-1.5">
          {timed.map((item) => {
            const active = current?.id === item.id;
            const done = item.status === "done";
            const minutes = item.endMinutes! - item.startMinutes!;

            return (
              <div
                key={item.id}
                data-active={active || undefined}
                style={{ flexGrow: minutes, flexBasis: 0 }}
                className={cn(
                  "relative min-w-[5.75rem] shrink-0 rounded-panel border px-2 py-1.5",
                  active
                    ? "border-accent-line bg-accent-soft"
                    : done
                      ? "border-success/40 bg-success-soft"
                      : "border-subtle bg-sunken",
                )}
              >
                <p className="text-[0.6875rem] font-semibold leading-snug text-primary [overflow-wrap:anywhere]">
                  {item.subjectCode ?? item.title}
                </p>
                <p className="whitespace-nowrap text-[0.625rem] text-muted tabular">
                  {item.startTime}–{item.endTime}
                </p>
                {active && now !== null && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 w-px bg-accent"
                    style={{ left: `${((now - item.startMinutes!) / minutes) * 100}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
