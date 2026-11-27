"use client";

import { LogIn, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";

import { startGuardianSessionAction, type AccountState } from "@/app/(parent)/parent/onboarding/actions";
import { ActionButton } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { keepInput } from "@/lib/utils/keepInput";

/**
 * Step 0 of onboarding: the household needs a real guardian account before the
 * wizard writes anything, because the household belongs to that auth user.
 */
export function OnboardingAccountGate() {
  const [mode, setMode] = useState<"sign-in" | "create">("create");
  const [state, formAction, pending] = useActionState<AccountState, FormData>(startGuardianSessionAction, null);

  return (
    <div className="surface p-5">
      <div role="tablist" aria-label="Guardian account" className="mb-5 flex gap-1 rounded-lg bg-sunken p-1">
        {(
          [
            { id: "create", label: "Create account", icon: UserPlus },
            { id: "sign-in", label: "I have an account", icon: LogIn },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === mode;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(tab.id)}
              className="tab-btn pressable"
            >
              <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={keepInput(formAction)} className="space-y-3">
        <input type="hidden" name="mode" value={mode} />

        <div>
          <label htmlFor="guardian-email" className="label">
            Guardian email
          </label>
          <input
            id="guardian-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1.5 w-full rounded-lg border border-strong bg-card px-3 py-2.5 text-base text-primary focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="guardian-password" className="label">
            Password
          </label>
          <input
            id="guardian-password"
            name="password"
            type="password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            minLength={8}
            required
            className="mt-1.5 w-full rounded-lg border border-strong bg-card px-3 py-2.5 text-base text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1.5 text-caption text-muted">
            At least eight characters. This account owns the household, so keep it to yourself.
          </p>
        </div>

        <ActionButton
          pending={pending}
          pendingLabel="Working"
          className="w-full"
          icon={
            mode === "create" ? (
              <UserPlus aria-hidden="true" className="size-4" strokeWidth={2} />
            ) : (
              <LogIn aria-hidden="true" className="size-4" strokeWidth={2} />
            )
          }
        >
          {mode === "create" ? "Create guardian account" : "Sign in and continue"}
        </ActionButton>

        <p
          role="status"
          aria-live="polite"
          className={cn(
            "text-caption",
            state?.error ? "text-danger-text" : state?.message ? "text-success-text" : "invisible",
          )}
        >
          {state?.error ?? state?.message ?? "placeholder"}
        </p>
      </form>
    </div>
  );
}
