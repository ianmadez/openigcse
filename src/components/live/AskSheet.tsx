"use client";

import { ArrowLeft, Send, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { raiseRequestAction, todayPeriodsAction } from "@/app/(student)/request-actions";
import { REQUESTS, REQUEST_TYPES, type RequestType } from "@/lib/requests/catalog";
import { cn } from "@/lib/utils/cn";

/**
 * The learner's typed asks (Step 5.1). One tap picks the type, an optional note says why, and
 * the request only counts as sent once Postgres accepted it.
 */
export function AskSheet({ onClose, initial }: { onClose: () => void; initial?: RequestType }) {
  const [type, setType] = useState<RequestType | null>(initial ?? null);
  const [note, setNote] = useState("");
  const [periods, setPeriods] = useState<Array<{ id: string; title: string }> | null>(null);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (type !== "swap" || periods) return;
    todayPeriodsAction()
      .then((result) => setPeriods(result.ok ? result.items : []))
      .catch(() => setPeriods([]));
  }, [type, periods]);

  const send = () => {
    if (!type) return;
    setError(null);
    startTransition(async () => {
      const result = await raiseRequestAction({
        type,
        note: note || undefined,
        dayPlanItemId: type === "swap" ? first || null : null,
        withItemId: type === "swap" ? second || null : null,
      }).catch(() => ({ ok: false as const, error: "The server could not be reached." }));
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  };

  const menu = REQUEST_TYPES.filter((entry) => !REQUESTS[entry].contextual);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="ask-title" className="surface w-full max-w-md rounded-b-none p-4 sm:rounded-card sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          {type && !sent && !initial && (
            <button type="button" onClick={() => setType(null)} className="icon-btn size-8" aria-label="Back to the list">
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          )}
          <h2 id="ask-title" className="flex-1 text-heading font-semibold text-primary">
            {sent ? "Sent" : type ? REQUESTS[type].ask : "Ask a parent"}
          </h2>
          <button type="button" onClick={onClose} className="icon-btn size-8" aria-label="Close">
            <X aria-hidden="true" className="size-4" strokeWidth={2} />
          </button>
        </div>

        {sent ? (
          <div className="space-y-3">
            <p role="status" className="text-[0.9375rem] text-secondary">
              Your parent has been told. Their answer appears on this screen as soon as they tap it.
            </p>
            <button type="button" onClick={onClose} className="btn-primary pressable w-full">
              Back to work
            </button>
          </div>
        ) : !type ? (
          <ul className="grid gap-2">
            {menu.map((entry) => (
              <li key={entry}>
                <button type="button" onClick={() => setType(entry)} className="row-hover flex w-full items-center justify-between gap-3 rounded-panel border border-subtle bg-card px-3.5 py-3 text-left">
                  <span className="text-[0.9375rem] font-medium text-primary">{REQUESTS[entry].ask}</span>
                  <span className="text-caption text-muted">{REQUESTS[entry].label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {type === "swap" && (
              <div className="grid gap-2">
                {periods === null ? (
                  <p className="text-caption text-muted">Loading today&apos;s periods</p>
                ) : periods.length < 2 ? (
                  <p className="text-caption text-muted">There are not two open periods left today to swap.</p>
                ) : (
                  <>
                    <label className="grid gap-1 text-caption text-secondary">
                      Move this one earlier
                      <select value={second} onChange={(event) => setSecond(event.target.value)} className="field">
                        <option value="">Pick a period</option>
                        {periods.map((period) => (
                          <option key={period.id} value={period.id}>
                            {period.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-caption text-secondary">
                      Swap it with
                      <select value={first} onChange={(event) => setFirst(event.target.value)} className="field">
                        <option value="">Pick a period</option>
                        {periods.filter((period) => period.id !== second).map((period) => (
                          <option key={period.id} value={period.id}>
                            {period.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            )}
            <label className="grid gap-1 text-caption text-secondary">
              Note (optional)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 300))}
                rows={2}
                placeholder={REQUESTS[type].placeholder}
                className="field resize-none"
              />
            </label>
            {error && (
              <p role="alert" className="text-caption text-danger-text">
                Not sent: {error}
              </p>
            )}
            <button
              type="button"
              onClick={send}
              disabled={pending || (type === "swap" && (!first || !second))}
              className={cn("btn-primary pressable w-full", pending && "opacity-70")}
            >
              <Send aria-hidden="true" className="size-4" strokeWidth={2} />
              {pending ? "Sending" : "Send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
