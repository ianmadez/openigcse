"use client";

import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * A refused or failed write, with a visible way to send it again (Phase 8). Nothing is retried
 * behind the learner's or parent's back: the message says the change was not saved, and the
 * button repeats exactly the write that failed.
 *
 * Inside a `<form action>`, leave `onRetry` out and the button resubmits the form, whose input
 * `keepInput()` has kept.
 */
export function WriteError({
  error,
  onRetry,
  pending = false,
  className,
}: {
  error: string | null | undefined;
  onRetry?: () => void;
  pending?: boolean;
  className?: string;
}) {
  if (!error) return null;

  return (
    <p role="alert" className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-caption font-medium text-danger-text", className)}>
      <span>Not saved. {error}</span>
      <button
        type={onRetry ? "button" : "submit"}
        onClick={onRetry}
        disabled={pending}
        aria-busy={pending}
        className="btn-ghost touch-target min-h-0 px-2 py-1 text-danger-text"
      >
        <RotateCcw aria-hidden="true" className={cn("size-3.5", pending && "motion-safe:animate-spin")} strokeWidth={2} />
        {pending ? "Trying again" : "Try again"}
      </button>
    </p>
  );
}
