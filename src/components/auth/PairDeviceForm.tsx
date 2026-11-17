"use client";

import { Link2, ShieldAlert } from "lucide-react";
import { useActionState } from "react";

import { redeemPairingCodeAction, type AuthState } from "@/app/login/actions";
import { ActionButton } from "@/components/ui/Button";

export function PairDeviceForm({ revoked = false }: { revoked?: boolean }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(redeemPairingCodeAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {revoked && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning-soft px-3 py-2 text-caption text-warning-text"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          This device was signed out by the parent. Ask for a fresh pairing code to continue.
        </p>
      )}

      <div>
        <label htmlFor="pairing-code" className="label">
          Six-digit pairing code
        </label>
        <input
          id="pairing-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "pairing-error" : "pairing-hint"}
          className="mt-1.5 w-full rounded-lg border border-strong bg-card px-3 py-2.5 text-center text-2xl tracking-[0.4em] text-primary focus:border-accent focus:outline-none tabular"
          placeholder="000000"
        />
        <p id="pairing-hint" className="mt-2 text-caption text-muted">
          The parent generates this on the settings screen. It works once and expires after 15 minutes.
        </p>
      </div>

      <ActionButton
        pending={pending}
        pendingLabel="Pairing"
        icon={<Link2 aria-hidden="true" className="size-4" strokeWidth={2} />}
        className="w-full"
      >
        Pair this device
      </ActionButton>

      <p
        id="pairing-error"
        role="status"
        aria-live="polite"
        className={state?.error ? "text-caption text-danger-text" : "invisible text-caption"}
      >
        {state?.error ?? "placeholder"}
      </p>
    </form>
  );
}
