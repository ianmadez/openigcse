"use client";

import { Coffee, Hand, Megaphone, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AskSheet } from "@/components/live/AskSheet";
import { BodyPortal } from "@/components/live/BodyPortal";
import { NotificationBell } from "@/components/live/NotificationBell";
import { heartbeatAction } from "@/app/shell-actions";
import { decisionLabel, REQUESTS, type RequestType } from "@/lib/requests/catalog";
import { formatCountdown, HEARTBEAT_MS } from "@/lib/live/presence";
import { readStudyState } from "@/lib/live/studyState";
import { useRealtime } from "@/lib/live/useRealtime";

export type DockRequest = {
  id: string;
  type: RequestType;
  status: string;
  decision: string | null;
  parentReply: string | null;
  effectUntil: string | null;
};

/**
 * Everything live on the learner's screen (Phase 5): the Ask button, the message and notification
 * shortcuts, the break countdown, an answer as it arrives, a message the parent pushed to the
 * screen, and the 30-second heartbeat the parent's live monitor reads.
 */
export function StudentDock({
  learnerId,
  householdId,
  unreadMessages,
  breakSecondsLeft,
}: {
  learnerId: string;
  householdId: string;
  unreadMessages: number;
  /** Seconds left on a running break, measured on the database clock. */
  breakSecondsLeft: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  // A local deadline: the device clock may be off, so only durations cross the wire.
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  const [answer, setAnswer] = useState<DockRequest | null>(null);
  const [screenMessage, setScreenMessage] = useState<{ text: string; at: string } | null>(null);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [dayEnded, setDayEnded] = useState(false);
  const [unread, setUnread] = useState(unreadMessages);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setUnread(unreadMessages), [unreadMessages]);
  useEffect(() => setBreakEnd(breakSecondsLeft > 0 ? Date.now() + breakSecondsLeft * 1000 : null), [breakSecondsLeft]);

  // A decision arrives over Realtime: show it, and start the break clock at once.
  useRealtime(`requests:${learnerId}`, "requests", `student_id=eq.${learnerId}`, (change) => {
    const row = change.new as Record<string, unknown> | undefined;
    if (!row || change.eventType === "DELETE") return;
    const request: DockRequest = {
      id: row.id as string,
      type: row.request_type as RequestType,
      status: row.status as string,
      decision: (row.decision as string) ?? null,
      parentReply: (row.parent_reply as string) ?? null,
      effectUntil: (row.effect_until as string) ?? null,
    };
    if (request.type === "break") {
      // effect_until minus the commit time are both database timestamps.
      const committed = Date.parse((change as { commit_timestamp?: string }).commit_timestamp ?? "");
      const left = request.status === "approved" && request.effectUntil && Number.isFinite(committed) ? Date.parse(request.effectUntil) - committed : 0;
      setBreakEnd(left > 0 ? Date.now() + left : null);
    }
    if (change.eventType === "UPDATE" && (change.old as Record<string, unknown>)?.status === "pending" && request.status !== "pending") {
      if (!(request.type === "break" && request.status === "approved")) setAnswer(request);
      router.refresh();
    }
  });

  useRealtime(`thread:${householdId}:dock`, "messages", `household_id=eq.${householdId}`, (change) => {
    const row = change.new as Record<string, unknown>;
    if (row?.sender_profile_id !== learnerId && pathname !== "/messages") setUnread((value) => value + 1);
  }, "INSERT");

  useRealtime(`kiosk:${learnerId}`, "kiosk_sessions", `student_id=eq.${learnerId}`, (change) => {
    const row = change.new as Record<string, unknown>;
    if (row?.screen_message && row.screen_message_at) setScreenMessage({ text: row.screen_message as string, at: row.screen_message_at as string });
    if (row?.day_ended_at) setDayEnded(true);
  }, "UPDATE");

  // The heartbeat: every 30 seconds, and at once when the page becomes visible again.
  const beat = useCallback(async () => {
    const study = readStudyState();
    const focus = document.visibilityState === "hidden" ? "hidden" : document.hasFocus() ? "visible" : "blurred";
    const result = await heartbeatAction({ route: pathname, itemId: study.itemId, focus, timerRunning: study.timerRunning }).catch(() => null);
    if (result?.ok) {
      if (result.screenMessage && result.screenMessageAt) setScreenMessage({ text: result.screenMessage, at: result.screenMessageAt });
      setDayEnded(result.dayEnded);
    }
  }, [pathname]);

  const beatRef = useRef(beat);
  beatRef.current = beat;
  useEffect(() => {
    beatRef.current();
    const id = window.setInterval(() => beatRef.current(), HEARTBEAT_MS);
    const onVisible = () => beatRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("blur", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("blur", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  useEffect(() => {
    if (pathname === "/messages") setUnread(0);
  }, [pathname]);

  // The countdown ticks only while a break is running.
  useEffect(() => {
    if (!breakEnd) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [breakEnd]);

  const breakLeft = breakEnd ? Math.max(0, Math.ceil((breakEnd - now) / 1000)) : 0;
  const showMessage = screenMessage && screenMessage.at !== dismissedAt;

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="btn-secondary pressable px-2.5 py-1.5 text-[0.8125rem] sm:px-3"
        aria-label="Ask"
      >
        <Hand aria-hidden="true" className="size-4" strokeWidth={2} />
        <span className="hidden min-[400px]:inline">Ask</span>
      </button>
      <Link href="/messages" className="icon-btn relative" aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}>
        <MessageCircle aria-hidden="true" className="size-4" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[0.6875rem] font-semibold leading-[1.1rem] text-on-accent tabular">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <NotificationBell profileId={learnerId} />

      <BodyPortal>
      {asking && <AskSheet onClose={() => setAsking(false)} />}

      <div className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-30 flex flex-col items-center gap-2 px-4">
        {breakLeft > 0 && (
          <div role="timer" aria-live="polite" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card border border-success/40 bg-success-soft px-4 py-3 shadow-lg">
            <Coffee aria-hidden="true" className="size-5 shrink-0 text-success-text" strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-semibold text-success-text">Break</p>
              <p className="text-caption text-secondary">The period timer waits. Come back when it ends.</p>
            </div>
            <span className="font-display text-title font-semibold text-success-text tabular">{formatCountdown(breakLeft)}</span>
          </div>
        )}

        {answer && (
          <div role="status" className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border border-subtle bg-card px-4 py-3 shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-semibold text-primary">
                {REQUESTS[answer.type]?.label ?? "Request"}: {answer.status === "approved" ? decisionLabel(answer.type, answer.decision) : answer.status === "expired" ? "expired" : "not now"}
              </p>
              {answer.parentReply && <p className="text-caption text-secondary">{answer.parentReply}</p>}
            </div>
            <button type="button" onClick={() => setAnswer(null)} className="icon-btn size-8" aria-label="Dismiss">
              <X aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          </div>
        )}

        {showMessage && (
          <div role="alert" className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border border-info/40 bg-info-soft px-4 py-3 shadow-lg">
            <Megaphone aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info-text" strokeWidth={2} />
            <p className="min-w-0 flex-1 text-[0.875rem] font-medium text-info-text">{screenMessage.text}</p>
            <button type="button" onClick={() => setDismissedAt(screenMessage.at)} className="icon-btn size-8" aria-label="Dismiss">
              <X aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          </div>
        )}

        {dayEnded && (
          <div role="status" className="pointer-events-auto w-full max-w-md rounded-card border border-subtle bg-card px-4 py-3 text-[0.875rem] text-secondary shadow-lg">
            School is finished for today. Anything left moves to the next school day.
          </div>
        )}
      </div>
      </BodyPortal>
    </>
  );
}
