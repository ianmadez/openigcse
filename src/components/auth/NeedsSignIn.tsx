import Link from "next/link";
import { KeyRound, LogIn } from "lucide-react";

import { Panel } from "@/components/ui/primitives";

/**
 * Shown when the page needs a real session to read the household's rows.
 *
 * Phase 1 moved every read onto the session-bound client, so RLS returns
 * nothing without one. Saying so is better than an empty screen that looks
 * broken.
 */
export function NeedsSignIn({
  audience = "guardian",
  reason = "signed-out",
}: {
  audience?: "guardian" | "learner";
  reason?: "signed-out" | "no-household";
}) {
  const guardian = audience === "guardian";
  const unlinked = reason === "no-household";

  return (
    <Panel
      title={
        guardian
          ? unlinked
            ? "This account has no household yet"
            : "Sign in to load the household"
          : "Pair this device"
      }
    >
      <p className="max-w-[52ch] text-[0.9375rem] leading-relaxed text-secondary">
        {guardian
          ? unlinked
            ? "The account is signed in, but it is not linked to a household, so every read comes back empty. Open onboarding to link it to the household already on this database."
            : "The parent area is unlocked, but this page reads real rows and those are scoped to a signed-in guardian. Sign in with the account that owns the household."
          : "This page reads the learner's own rows, so the device needs its pairing code first."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={unlinked ? "/parent/onboarding" : guardian ? "/login" : "/pair"} className="btn-primary pressable">
          {guardian ? (
            <KeyRound aria-hidden="true" className="size-4" strokeWidth={2} />
          ) : (
            <LogIn aria-hidden="true" className="size-4" strokeWidth={2} />
          )}
          {unlinked ? "Open onboarding" : guardian ? "Sign in" : "Pair this device"}
        </Link>

        {!guardian && (
          <Link href="/login" className="btn-secondary pressable">
            I am the guardian
          </Link>
        )}
      </div>
    </Panel>
  );
}
