"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import {
  finishPlanItemAction,
  logLessonTimeAction,
  skipPlanItemAction,
  startPlanItemAction,
} from "@/app/(student)/learning-actions";
import { drain, enqueue, isNetworkFailure, parseQueue, type QueuedKind, type QueuedWrite, type SendResult } from "@/lib/offline/queue";

const KEY = "openigcse-offline-writes";

/** On success the server's own fields (such as `startedAt`) come back too, unless the write was held. */
type Outcome = ({ ok: true; queued?: boolean } & Record<string, unknown>) | { ok: false; error: string };

type OfflineWrites = {
  /** Runs a write now; if the network is down it is held and `{ ok: true, queued: true }` comes back. */
  run: (kind: QueuedKind, input: Record<string, unknown>, now: () => Promise<{ ok: boolean; error?: string }>) => Promise<Outcome>;
  waiting: number;
};

const Context = createContext<OfflineWrites | null>(null);

/** Without the provider (a guardian previewing) writes simply run and network failures are errors. */
export function useOfflineWrites(): OfflineWrites {
  return (
    useContext(Context) ?? {
      waiting: 0,
      run: async (_kind, _input, now) => {
        const result = await now().catch(() => ({ ok: false, error: "The server could not be reached." }));
        return result.ok ? { ok: true } : { ok: false, error: result.error ?? "That could not be saved." };
      },
    }
  );
}

function send(write: QueuedWrite): Promise<SendResult> {
  const text = (key: string) => String(write.input[key] ?? "");
  const count = (key: string) => Number(write.input[key] ?? 0);
  const call =
    write.kind === "start"
      ? startPlanItemAction(text("id"), write.queuedAt)
      : write.kind === "finish"
        ? finishPlanItemAction({ id: text("id"), minutes: count("minutes") })
        : write.kind === "skip"
          ? skipPlanItemAction({ id: text("id"), reason: text("reason") })
          : logLessonTimeAction({ objectiveCode: text("objectiveCode"), minutes: count("minutes") });
  return call.then((result) => (result.ok ? { ok: true } : { ok: false, error: result.error ?? "Refused." }));
}

function load(): QueuedWrite[] {
  try {
    return parseQueue(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

const LABEL: Record<QueuedKind, string> = { start: "Start", finish: "Finish", skip: "Skip", logTime: "Study time" };

/**
 * Holds /today's writes while the device is offline (Step 7.3) and says so on screen. This is not
 * a silent fallback: the banner shows how many writes are waiting, and any write Postgres refuses
 * on replay is reported by name instead of being retried.
 */
export function OfflineWritesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueuedWrite[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const [storageBroken, setStorageBroken] = useState(false);
  const draining = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const persist = useCallback((next: QueuedWrite[]) => {
    setQueue(next);
    try {
      if (next.length) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
      setStorageBroken(false);
    } catch {
      setStorageBroken(true);
    }
  }, []);

  const flush = useCallback(async () => {
    if (draining.current) return;
    const pending = load();
    if (!pending.length) return;
    draining.current = true;
    try {
      const result = await drain(pending, send);
      // Writes queued while draining were appended to storage; keep them after what is left.
      const added = load().slice(pending.length);
      persist([...result.remaining, ...added]);
      if (result.refused.length) {
        setRefused((current) => [...current, ...result.refused.map((r) => `${LABEL[r.write.kind]}: ${r.error}`)]);
      }
      if (result.sent || result.refused.length) router.refresh();
      // Writes queued during this drain go next, unless the network failed again.
      if (added.length && !result.remaining.length) queueMicrotask(() => void flushRef.current());
    } finally {
      draining.current = false;
    }
  }, [persist, router]);

  flushRef.current = flush;

  useEffect(() => {
    setQueue(load());
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void flush();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [flush]);

  const run: OfflineWrites["run"] = useCallback(
    async (kind, input, now) => {
      const hold = () => {
        const write: QueuedWrite = { id: crypto.randomUUID(), kind, input, queuedAt: new Date().toISOString() };
        persist(enqueue(load(), write));
        return { ok: true as const, queued: true };
      };
      // Anything already waiting goes first, so a new write never overtakes an older one.
      if (!navigator.onLine || load().length) {
        if (navigator.onLine) void flush();
        return hold();
      }
      try {
        const result = await now();
        return result.ok ? { ...result, ok: true } : { ok: false, error: result.error ?? "That could not be saved." };
      } catch (error) {
        if (isNetworkFailure(error)) return hold();
        return { ok: false, error: "The server could not be reached." };
      }
    },
    [flush, persist],
  );

  return (
    <Context.Provider value={{ run, waiting: queue.length }}>
      {(queue.length > 0 || !online || refused.length > 0) && (
        <div role="status" className="mb-4 space-y-2 rounded-panel border border-warning/40 bg-warning-soft px-3 py-2 text-caption text-warning-text">
          {!online && (
            <p className="flex items-center gap-2 font-medium">
              <CloudOff aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
              Offline. Today&apos;s plan is the last copy this device saw.
            </p>
          )}
          {queue.length > 0 && (
            <p className="flex flex-wrap items-center gap-2">
              {queue.length} {queue.length === 1 ? "change is" : "changes are"} held on this device and not yet saved:{" "}
              {queue.map((write) => LABEL[write.kind]).join(", ")}.
              {storageBroken && " This browser is not keeping them, so they will be lost if you close the page."}
              {online && (
                <button type="button" onClick={() => void flush()} className="btn-ghost touch-target min-h-0 px-2 py-1">
                  <RefreshCw aria-hidden="true" className="size-3.5" strokeWidth={2} />
                  Send now
                </button>
              )}
            </p>
          )}
          {refused.map((line, index) => (
            <p key={index} className="text-danger-text">
              Not saved when the connection came back. {line}
            </p>
          ))}
          {refused.length > 0 && (
            <button type="button" className="btn-ghost touch-target min-h-0 px-2 py-1" onClick={() => setRefused([])}>
              Dismiss
            </button>
          )}
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
