"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { unlockParent, type UnlockState } from "@/app/(parent)/parent/actions";
import { ActionButton } from "@/components/ui/Button";

export function ParentGate({ hint, needsSetup }: { hint: string | null; needsSetup?: boolean }) {
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(unlockParent, null);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent">
            O
          </span>
          <span className="text-[0.9375rem] font-semibold text-primary">OpenIGCSE</span>
        </div>

        <h1 className="text-title font-semibold text-primary">Parent access</h1>
        <p className="mt-1.5 max-w-[38ch] text-[0.9375rem] leading-relaxed text-secondary">
          This side holds marking, term dates and focus controls. Enter the guardian PIN to continue.
        </p>

        <form action={formAction} className="mt-5">
          <label htmlFor="pin" className="label">
            Guardian PIN
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={8}
              aria-invalid={Boolean(state?.error)}
              aria-describedby={state?.error ? "pin-error" : undefined}
              className="min-w-0 flex-1 rounded-lg border border-strong bg-card px-3 py-2.5 text-base tracking-[0.3em] text-primary focus:border-accent focus:outline-none"
              placeholder="----"
            />
            <ActionButton
              pending={pending}
              pendingLabel="Checking"
              icon={<KeyRound aria-hidden="true" className="size-4" strokeWidth={2} />}
              className="shrink-0"
            >
              Unlock
            </ActionButton>
          </div>

          <p
            id="pin-error"
            role="status"
            aria-live="polite"
            className={state?.error ? "mt-2 text-caption text-danger-text" : "mt-2 invisible text-caption"}
          >
            {state?.error ?? "placeholder"}
          </p>
        </form>

        {needsSetup && (
          <p className="mt-4 rounded-panel border border-info/40 bg-info-soft px-3 py-2 text-caption text-info-text">
            No household is set up yet.{" "}
            <Link href="/parent/onboarding" className="font-semibold underline">
              Start onboarding
            </Link>{" "}
            to create the learner and the guardian PIN.
          </p>
        )}

        {hint && (
          <p className="mt-4 rounded-panel border border-subtle bg-sunken px-3 py-2 text-caption text-muted">
            Development build. The PIN is <span className="font-mono font-semibold text-primary">{hint}</span>, set by
            the PARENT_MASTER_PIN environment variable.
          </p>
        )}
      </div>
    </main>
  );
}
