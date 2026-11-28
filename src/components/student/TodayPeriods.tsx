"use client";

import { ArrowDown, ArrowUp, Check, Loader2, Play, PlayCircle, SkipForward } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { reportStudyState } from "@/lib/live/studyState";
import {
  finishPlanItemAction,
  reorderPeriodAction,
  skipPlanItemAction,
  startPlanItemAction,
} from "@/app/(student)/learning-actions";
import { useOfflineWrites } from "@/components/student/OfflineWrites";
import { ActionButton } from "@/components/ui/Button";
import { WriteError } from "@/components/ui/WriteError";
import { Status } from "@/components/ui/primitives";
import type { DayPlanItem } from "@/lib/data/timetable-shared";
import type { LessonResource } from "@/lib/data/workspace";
import { SKIP_REASONS, elapsedMinutes, groupByPeriod, reorderWithin } from "@/lib/planning/today";
import { cn } from "@/lib/utils/cn";

type Busy = "start" | "finish" | "skip" | "move";

const STATUS_LABEL: Record<DayPlanItem["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  deferred: "Carried over",
  skipped: "Skipped",
};

/**
 * The learner's day as periods (Step 4.1). Start, Finish, Skip and reordering all write to
 * Postgres; nothing changes on screen as "saved" unless the server accepted it.
 */
export function TodayPeriods({ items, resources }: { items: DayPlanItem[]; resources: LessonResource[] }) {
  const [plan, setPlan] = useState(items);
  // Which item, doing what: only that button spins, and a refusal shows on that item's card.
  const [busy, setBusy] = useState<{ id: string; action: Busy } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const last = useRef<(() => void) | null>(null);
  const offline = useOfflineWrites();

  useEffect(() => setPlan(items), [items]);

  // The heartbeat reports the period in progress (Step 5.4).
  useEffect(() => {
    const active = plan.find((entry) => entry.status === "in_progress");
    reportStudyState("periods", { timerRunning: Boolean(active), itemId: active?.id ?? null });
    return () => reportStudyState("periods", null);
  }, [plan]);

  const patch = (id: string, change: Partial<DayPlanItem>) =>
    setPlan((current) => current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));

  const run = (id: string, action: Busy, work: () => Promise<{ ok: boolean; error?: string }>) => {
    last.current = () => run(id, action, work);
    setError(null);
    setBusy({ id, action });
    startTransition(async () => {
      const result = await work().catch(() => ({ ok: false, error: "The server could not be reached." }));
      if (!result.ok) setError({ id, message: result.error ?? "That could not be saved." });
      setBusy(null);
    });
  };

  // Start, Finish and Skip survive a dropped connection (Step 7.3): the banner above the plan
  // says they are held on this device until they reach Postgres.
  const start = (item: DayPlanItem) =>
    run(item.id, "start", async () => {
      const result = await offline.run("start", { id: item.id }, () => startPlanItemAction(item.id));
      if (!result.ok) return result;
      const startedAt = "startedAt" in result && typeof result.startedAt === "string" ? result.startedAt : new Date().toISOString();
      patch(item.id, { status: "in_progress", startedAt });
      return result;
    });

  const finish = (item: DayPlanItem) =>
    run(item.id, "finish", async () => {
      const minutes = elapsedMinutes(item.startedAt, new Date());
      const result = await offline.run("finish", { id: item.id, minutes }, () => finishPlanItemAction({ id: item.id, minutes }));
      if (result.ok) patch(item.id, { status: "done", actualMinutes: minutes });
      return result;
    });

  const skip = (item: DayPlanItem, reason: string) =>
    run(item.id, "skip", async () => {
      const result = await offline.run("skip", { id: item.id, reason }, () => skipPlanItemAction({ id: item.id, reason }));
      if (result.ok) patch(item.id, { status: "skipped", skipReason: reason });
      return result;
    });

  const move = (period: DayPlanItem[], item: DayPlanItem, direction: -1 | 1) => {
    const moves = reorderWithin(period, item.id, direction);
    if (!moves) return;
    run(item.id, "move", async () => {
      const result = await reorderPeriodAction(moves);
      if (result.ok) {
        const sequenceById = new Map(moves.map((entry) => [entry.id, entry.sequence]));
        setPlan((current) =>
          current.map((entry) =>
            sequenceById.has(entry.id) ? { ...entry, sequence: sequenceById.get(entry.id)!, studentReordered: true } : entry,
          ),
        );
      }
      return result;
    });
  };

  return (
    <>
      <ol className="space-y-3">
        {groupByPeriod(plan).map((period) => {
          const first = period.items[0]!;
          return (
            <li key={period.slotId ?? "unslotted"} className="surface p-3">
              <p className="text-caption text-muted tabular">
                {first.startTime ? `${first.startTime}–${first.endTime}` : "Any time today"}
                {first.subjectName ? ` · ${first.subjectName}` : ""}
              </p>
              <ul className="mt-2 space-y-2">
                {period.items.map((item, index) => (
                  <TaskCard
                    key={item.id}
                    item={item}
                    resource={resources.find((entry) => entry.objectiveCode === item.objectiveCode) ?? null}
                    pending={pending}
                    busy={busy?.id === item.id ? busy.action : null}
                    error={error?.id === item.id ? error.message : null}
                    onRetry={() => last.current?.()}
                    canMoveUp={index > 0 && item.status !== "done"}
                    canMoveDown={index < period.items.length - 1 && item.status !== "done"}
                    onStart={() => start(item)}
                    onFinish={() => finish(item)}
                    onSkip={(reason) => skip(item, reason)}
                    onMove={(direction) => move(period.items, item, direction)}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function TaskCard({
  item,
  resource,
  pending,
  busy,
  error,
  onRetry,
  canMoveUp,
  canMoveDown,
  onStart,
  onFinish,
  onSkip,
  onMove,
}: {
  item: DayPlanItem;
  resource: LessonResource | null;
  pending: boolean;
  busy: Busy | null;
  error: string | null;
  onRetry: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onStart: () => void;
  onFinish: () => void;
  onSkip: (reason: string) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const open = item.status === "planned" || item.status === "deferred" || item.status === "in_progress";
  const isBreak = item.itemType === "break";

  useEffect(() => {
    if (item.status !== "in_progress") return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, [item.status]);

  const skipLabel = SKIP_REASONS.find((reason) => reason.value === item.skipReason)?.label;

  return (
    <li className="rounded-panel border border-subtle bg-card p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-medium text-primary">{item.title}</p>
          <p className="text-caption text-muted">
            {item.plannedMinutes} min planned
            {item.status === "done" ? ` · ${item.actualMinutes} min studied` : ""}
            {item.studentReordered ? " · reordered" : ""}
          </p>
        </div>
        <Status tone={item.status === "done" ? "success" : item.status === "in_progress" ? "accent" : item.status === "skipped" ? "warning" : "neutral"}>
          {STATUS_LABEL[item.status]}
          {item.status === "skipped" && skipLabel ? `: ${skipLabel}` : ""}
        </Status>
      </div>

      {item.reasons.length > 0 && !isBreak && (
        <p className="mt-1.5 text-caption leading-relaxed text-secondary">
          <span className="font-medium text-primary">Why this: </span>
          {item.reasons.join("; ").toLowerCase()}
        </p>
      )}

      {resource && !isBreak && (
        <a
          href={resource.url ?? `https://www.youtube.com/watch?v=${resource.youtubeVideoId}&t=${resource.startSeconds}s`}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-caption font-medium text-accent-text underline"
        >
          <PlayCircle aria-hidden="true" className="size-3.5" strokeWidth={2} />
          {resource.title} ({resource.provider})
        </a>
      )}

      {open && !isBreak && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {item.status === "in_progress" ? (
            <>
              <span className="text-caption text-secondary tabular" aria-live="off">
                {now ? `${elapsedMinutes(item.startedAt, now)} min so far` : "Started"}
              </span>
              <ActionButton
                type="button"
                onClick={onFinish}
                pending={busy === "finish"}
                disabled={pending}
                pendingLabel="Saving"
                icon={<Check aria-hidden="true" className="size-4" strokeWidth={2.4} />}
              >
                Finish
              </ActionButton>
            </>
          ) : (
            <ActionButton
              type="button"
              onClick={onStart}
              pending={busy === "start"}
              disabled={pending}
              pendingLabel="Starting"
              icon={<Play aria-hidden="true" className="size-4" strokeWidth={2.2} />}
            >
              Start
            </ActionButton>
          )}
          <button type="button" disabled={pending} onClick={() => setAsking((value) => !value)} className="btn-secondary pressable" aria-expanded={asking} aria-busy={busy === "skip"}>
            {busy === "skip" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={2.2} />
            ) : (
              <SkipForward aria-hidden="true" className="size-4" strokeWidth={2} />
            )}
            {busy === "skip" ? "Skipping" : "Skip"}
          </button>
          {busy === "move" && <Loader2 aria-label="Saving the new order" className="size-4 animate-spin text-muted" strokeWidth={2.2} />}
          {canMoveUp && (
            <button type="button" disabled={pending} onClick={() => onMove(-1)} className="btn-secondary pressable" aria-label={`Move ${item.title} earlier`}>
              <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          )}
          {canMoveDown && (
            <button type="button" disabled={pending} onClick={() => onMove(1)} className="btn-secondary pressable" aria-label={`Move ${item.title} later`}>
              <ArrowDown aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      <WriteError error={error} onRetry={onRetry} pending={pending} className="mt-2" />

      {asking && open && (
        <div role="group" aria-label="Why skip?" className="mt-2 flex flex-wrap gap-1.5">
          {SKIP_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              disabled={pending}
              onClick={() => {
                setAsking(false);
                onSkip(reason.value);
              }}
              className={cn("chip pressable")}
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
