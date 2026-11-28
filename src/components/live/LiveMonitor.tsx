"use client";

import { Coffee, Lock, LockOpen, Megaphone, MonitorSmartphone, Moon, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { liveAction } from "@/app/shell-actions";
import { ActionButton } from "@/components/ui/Button";
import { WriteError } from "@/components/ui/WriteError";
import { Status } from "@/components/ui/primitives";
import type { LiveSession } from "@/lib/data/live";
import { formatCountdown, idleMinutes, isOnline, lockStateOf } from "@/lib/live/presence";
import { useRealtime } from "@/lib/live/useRealtime";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export type LiveView = {
  householdId: string;
  learnerId: string;
  learnerName: string;
  session: LiveSession | null;
  periodLabel: string | null;
  currentTask: string | null;
  doneMinutes: number;
  plannedMinutes: number;
  focus: { isLocked: boolean; lockEndsAt: string | null } | null;
  /** Seconds left on a running break, on the database clock. */
  breakSecondsLeft: number;
};

/**
 * What is happening on the study device right now (Step 5.4), and the parent's remote actions.
 * Heartbeats, focus changes and requests arrive over Realtime; the clock ticks locally.
 */
export function LiveMonitor({ view }: { view: LiveView }) {
  const router = useRouter();
  const [session, setSession] = useState(view.session);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setSession(view.session), [view.session]);
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  useEffect(() => setBreakEnd(view.breakSecondsLeft > 0 ? Date.now() + view.breakSecondsLeft * 1000 : null), [view.breakSecondsLeft]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Heartbeats (every 30 s) and requests are applied from the payload. A full refresh would queue
  // ahead of the parent's next tap: Next runs server actions behind in-flight refreshes, and the
  // exit gate measured that as seconds of delay on the study device.
  useRealtime(`live:${view.learnerId}`, "kiosk_sessions", `student_id=eq.${view.learnerId}`, (change) => {
    const row = change.new as Record<string, unknown> | undefined;
    if (!row?.id || row.session_date !== (session?.sessionDate ?? row.session_date)) return;
    setSession({
      id: row.id as string,
      sessionDate: row.session_date as string,
      currentRoute: (row.current_route as string) ?? null,
      currentItemId: (row.current_item_id as string) ?? null,
      focusState: (row.focus_state as string) ?? null,
      timerRunning: Boolean(row.timer_running),
      lastHeartbeatAt: (row.last_heartbeat_at as string) ?? null,
      idleSince: (row.idle_since as string) ?? null,
      unfocusedCount: Number(row.unfocused_count ?? 0),
      screenMessage: (row.screen_message as string) ?? null,
      dayEndedAt: (row.day_ended_at as string) ?? null,
    });
  });
  useRealtime(`live-requests:${view.householdId}`, "requests", `household_id=eq.${view.householdId}`, (change) => {
    const row = change.new as Record<string, unknown> | undefined;
    if (row?.request_type !== "break") return;
    const committed = Date.parse((change as { commit_timestamp?: string }).commit_timestamp ?? "");
    const left = row.status === "approved" && row.effect_until && Number.isFinite(committed) ? Date.parse(row.effect_until as string) - committed : 0;
    setBreakEnd(left > 0 ? Date.now() + left : null);
  });
  // Rare changes (the plan, the lock) still take a full refresh.
  useRealtime(`live-focus:${view.householdId}`, "focus_policies", `household_id=eq.${view.householdId}`, () => router.refresh());
  useRealtime(`live-plan:${view.learnerId}`, "day_plan_items", `student_id=eq.${view.learnerId}`, () => router.refresh());

  const clock = new Date(now);
  const online = isOnline(session?.lastHeartbeatAt ?? null, clock);
  const idle = idleMinutes(session?.idleSince ?? null, clock);
  const lock = view.focus ? lockStateOf(view.focus.isLocked, view.focus.lockEndsAt, clock) : null;
  const breakLeft = breakEnd ? Math.max(0, Math.ceil((breakEnd - now) / 1000)) : 0;

  // The key of the button that was pressed, so only that one spins.
  const [running, setRunning] = useState<string | null>(null);
  const lastAct = useRef<(() => void) | null>(null);

  const act = (action: string, extra: { minutes?: number; message?: string } = {}, key: string = action) => {
    lastAct.current = () => act(action, extra, key);
    setResult(null);
    setRunning(key);
    startTransition(async () => {
      const outcome = await liveAction({ action, ...extra }).catch(() => ({ ok: false as const, error: "The server could not be reached." }));
      if (outcome.ok) {
        setResult({ ok: true, text: outcome.message });
        if (action === "message") setMessage("");
        router.refresh();
      } else setResult({ ok: false, text: outcome.error });
      setRunning(null);
    });
  };

  return (
    <div className="space-y-4">
      <section className="surface p-4 sm:p-5" aria-label="Study device">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-heading font-semibold text-primary">
            <MonitorSmartphone aria-hidden="true" className="size-5 text-secondary" strokeWidth={2} />
            {view.learnerName}&apos;s device
          </h2>
          <span data-volatile>
            <Status tone={online ? "success" : "neutral"}>{online ? "Online" : "Offline"}</Status>
          </span>
        </div>
        <p className="mt-1 text-caption text-muted" data-volatile>
          {session?.lastHeartbeatAt ? `Last seen ${timeFormat.format(new Date(session.lastHeartbeatAt))}` : "No heartbeat today yet. The device reports every 30 seconds while the app is open."}
          {session?.currentRoute ? ` on ${session.currentRoute}` : ""}
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Period" value={view.periodLabel ?? "No period right now"} />
          <Fact label="Task" value={view.currentTask ?? "Nothing started"} />
          <Fact
            label="Timer"
            value={breakLeft > 0 ? `On a break, ${formatCountdown(breakLeft)} left` : session?.timerRunning ? "Running" : idle !== null ? `Idle ${idle} min` : "Not running"}
            tone={breakLeft > 0 ? "success" : idle !== null && idle >= 15 ? "warning" : undefined}
          />
          <Fact
            label="Focus lock"
            value={!lock ? "No focus policy" : lock.locked ? "Locked" : lock.until ? `Unlocked until ${timeFormat.format(new Date(lock.until))}` : "Unlocked"}
          />
          <Fact label="Today" value={`${view.doneMinutes} of ${view.plannedMinutes} planned minutes done`} />
          <Fact label="Screen" value={session?.focusState === "hidden" ? "App in the background" : session?.focusState === "blurred" ? "Another window in front" : session ? "App on screen" : "Unknown"} />
        </dl>
        {session?.dayEndedAt && <p className="mt-3 text-caption text-muted">School day ended at {timeFormat.format(new Date(session.dayEndedAt))}.</p>}
      </section>

      <section className="surface p-4 sm:p-5" aria-label="Remote actions">
        <h2 className="text-heading font-semibold text-primary">Remote actions</h2>
        <p className="mt-1 text-caption text-muted">They reach the study device within a few seconds.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {breakLeft > 0 && (
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => act("end_break")}
              pending={running === "end_break"}
              disabled={pending}
              pendingLabel="Ending"
              icon={<Coffee aria-hidden="true" className="size-4" strokeWidth={2} />}
            >
              End break
            </ActionButton>
          )}
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => act("unlock", { minutes: 15 }, "unlock15")}
            pending={running === "unlock15"}
            disabled={pending}
            pendingLabel="Unlocking"
            icon={<LockOpen aria-hidden="true" className="size-4" strokeWidth={2} />}
          >
            Unlock 15 min
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => act("unlock", { minutes: 30 }, "unlock30")}
            pending={running === "unlock30"}
            disabled={pending}
            pendingLabel="Unlocking"
            icon={<LockOpen aria-hidden="true" className="size-4" strokeWidth={2} />}
          >
            Unlock 30 min
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => act("lock")}
            pending={running === "lock"}
            disabled={pending}
            pendingLabel="Locking"
            icon={<Lock aria-hidden="true" className="size-4" strokeWidth={2} />}
          >
            Lock now
          </ActionButton>
          <ActionButton
            type="button"
            variant="danger"
            onClick={() => window.confirm("End the school day? Unfinished items move to the next school day.") && act("end_day")}
            pending={running === "end_day"}
            disabled={pending}
            pendingLabel="Ending the day"
            icon={<Moon aria-hidden="true" className="size-4" strokeWidth={2} />}
          >
            End the school day
          </ActionButton>
        </div>

        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim()) act("message", { message });
          }}
        >
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, 280))}
            placeholder="Show a message on the screen"
            aria-label="Message for the study screen"
            className="field flex-1"
          />
          <ActionButton
            pending={running === "message"}
            disabled={pending || !message.trim()}
            pendingLabel="Sending"
            icon={<Megaphone aria-hidden="true" className="size-4" strokeWidth={2} />}
          >
            Send to screen
          </ActionButton>
        </form>

        {result?.ok && (
          <p role="status" className="mt-2 text-caption text-success-text">
            {result.text}
          </p>
        )}
        <WriteError
          error={result && !result.ok ? result.text : null}
          onRetry={() => lastAct.current?.()}
          pending={pending}
          className="mt-2"
        />
        <p className="mt-3 flex items-center gap-1.5 text-caption text-muted">
          <Timer aria-hidden="true" className="size-3.5" strokeWidth={2} />
          The lock is honoured by the kiosk app (Phase 9); in a browser it shows as a status only.
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <div className="rounded-panel border border-subtle bg-sunken px-3 py-2.5">
      <dt className="label">{label}</dt>
      <dd className={tone === "warning" ? "mt-0.5 text-[0.9375rem] font-medium text-warning-text" : tone === "success" ? "mt-0.5 text-[0.9375rem] font-medium text-success-text" : "mt-0.5 text-[0.9375rem] font-medium text-primary"}>
        {value}
      </dd>
    </div>
  );
}
