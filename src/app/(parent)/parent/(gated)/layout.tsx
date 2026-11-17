import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { ParentGate } from "@/components/parent/ParentGate";
import { gateTokenIsValid, PARENT_GATE_COOKIE } from "@/lib/auth/gate";
import { getSetupState, onboardingBypass } from "@/lib/data/session";

/**
 * Everything except onboarding sits behind the guardian PIN. Onboarding is
 * outside this group so a first-time household can create its PIN without one.
 */
export default async function GatedParentLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const unlocked = gateTokenIsValid(store.get(PARENT_GATE_COOKIE)?.value);
  const setup = await getSetupState();
  const bypass = onboardingBypass();
  const hint = process.env.NODE_ENV === "production" ? null : (process.env.PARENT_MASTER_PIN ?? "1234");

  if (!unlocked && !(bypass && setup.status !== "configured")) {
    return <ParentGate hint={hint} needsSetup={setup.status === "unconfigured"} />;
  }

  return <>{children}</>;
}
