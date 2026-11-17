"use client";

import { KeyRound, Link2, Mail, TabletSmartphone } from "lucide-react";
import { useActionState, useState } from "react";

import { sendMagicLinkAction, signInWithPasswordAction, type AuthState } from "@/app/login/actions";
import { PairDeviceForm } from "@/components/auth/PairDeviceForm";
import { ActionButton } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

type Mode = "password" | "magic-link" | "pair";

const TABS: { id: Mode; label: string; icon: typeof KeyRound }[] = [
  { id: "password", label: "Password", icon: KeyRound },
  { id: "magic-link", label: "Magic link", icon: Mail },
  { id: "pair", label: "Pair a device", icon: TabletSmartphone },
];

export function AuthPanel({ initialMode = "password" }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const [signInState, signInAction, signInPending] = useActionState<AuthState, FormData>(signInWithPasswordAction, null);
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(sendMagicLinkAction, null);

  return (
    <div className="surface p-5">
      <div role="tablist" aria-label="Sign-in method" className="mb-5 flex gap-1 rounded-lg bg-sunken p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === mode;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setMode(tab.id)}
              className="tab-btn pressable"
            >
              <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mode === "password" && (
        <section id="panel-password" role="tabpanel" aria-label="Email and password">
          <form action={signInAction} className="space-y-3">
            <div>
              <label htmlFor="signin-email" className="label">
                Email
              </label>
              <input
                id="signin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1.5 w-full rounded-lg border border-strong bg-card px-3 py-2.5 text-base text-primary focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="signin-password" className="label">
                Password
              </label>
              <input
                id="signin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1.5 w-full rounded-lg border border-strong bg-card px-3 py-2.5 text-base text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <ActionButton
              pending={signInPending}
              pendingLabel="Signing in"
              icon={<KeyRound aria-hidden="true" className="size-4" strokeWidth={2} />}
              className="w-full"
            >
              Sign in
            </ActionButton>

            <p
              role="status"
              aria-live="polite"
              className={signInState?.error ? "text-caption text-danger-text" : "invisible text-caption"}
            >
              {signInState?.error ?? "placeholder"}
            </p>
          </form>
        </section>
      )}

      {mode === "magic-link" && (
        <section id="panel-magic-link" role="tabpanel" aria-label="Email magic link">
          <form action={linkAction} className="space-y-3">
            <div>
              <label htmlFor="magic-email" className="label">
                Email
              </label>
              <input
                id="magic-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1.5 w-full rounded-lg border border-strong bg-card px-3 py-2.5 text-base text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <ActionButton
              pending={linkPending}
              pendingLabel="Sending"
              variant="secondary"
              icon={<Mail aria-hidden="true" className="size-4" strokeWidth={2} />}
              className="w-full"
            >
              Email me a sign-in link
            </ActionButton>

            <p
              role="status"
              aria-live="polite"
              className={cn(
                "text-caption",
                linkState?.error ? "text-danger-text" : linkState?.message ? "text-success-text" : "invisible",
              )}
            >
              {linkState?.error ?? linkState?.message ?? "placeholder"}
            </p>
          </form>
        </section>
      )}

      {mode === "pair" && (
        <section id="panel-pair" role="tabpanel" aria-label="Pair a student device">
          <p className="mb-4 flex items-start gap-2 text-caption text-secondary">
            <Link2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-accent-text" strokeWidth={2} />
            On the learner's device, enter the code the parent generated. The device then holds its own session and
            stays signed in until the parent revokes it.
          </p>
          <PairDeviceForm />
        </section>
      )}
    </div>
  );
}
