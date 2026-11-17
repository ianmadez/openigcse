import { getAuthContext } from "@/lib/auth/session";
import { getSetupState } from "@/lib/data/session";

/**
 * The learner signed in on this device. Sitting writes use the caller's own
 * profile, never "the first learner in the household", so a second learner
 * could never answer on the first one's paper.
 */
export async function requireLearnerSession(): Promise<
  { ok: true; householdId: string; learnerId: string } | { ok: false; error: string }
> {
  const [state, context] = await Promise.all([getSetupState(), getAuthContext()]);
  if (state.status !== "configured" || !context?.profileId) {
    return { ok: false, error: "This device is not signed in. Pair it with the learner's account first." };
  }
  if (context.role !== "student") {
    return { ok: false, error: "Only the learner's own device can sit an assessment." };
  }
  return { ok: true, householdId: state.householdId, learnerId: context.profileId };
}
