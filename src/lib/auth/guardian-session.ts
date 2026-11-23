import { authorizeGuardian } from "@/lib/auth/guard";
import { getSetupState } from "@/lib/data/session";

export type GuardianSession = {
  householdId: string;
  learnerId: string;
  profileId: string | null;
  activeTermId: string | null;
  role: string;
};

/**
 * The precondition for every Phase 3 parent write: the parent area is
 * unlocked AND a guardian is signed in to this household. Writes go through
 * the session client, so a PIN-only device would be refused by RLS anyway;
 * this says so up front instead of letting a write fail halfway.
 */
export async function requireGuardianSession(): Promise<
  { ok: true; session: GuardianSession } | { ok: false; error: string }
> {
  const active = await authorizeGuardian();
  if (!active) return { ok: false, error: "Unlock the parent area first." };

  const state = await getSetupState();
  if (state.status !== "configured") {
    return { ok: false, error: "Sign in with the guardian account to save. The PIN alone cannot write to the database." };
  }
  if (state.householdId !== active.householdId) return { ok: false, error: "This session belongs to another household." };
  if (state.role === "student") {
    return { ok: false, error: "This device is signed in as the learner. Sign in with the guardian account to save." };
  }

  return {
    ok: true,
    session: {
      householdId: state.householdId,
      learnerId: state.learnerId,
      profileId: active.profileId,
      activeTermId: state.activeTermId,
      role: state.role,
    },
  };
}
