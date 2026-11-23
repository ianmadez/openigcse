import { cache } from "react";

import { pickActiveTerm, toTermSummary, type TermSummary } from "@/lib/data/terms";
import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * Who is looking, and what they are allowed to see.
 *
 * Everything here goes through the session-bound client, so the answer is the
 * one Postgres gives under RLS rather than whatever the first row in the table
 * happens to be. `cache` keeps a request to a single round trip even though the
 * layout and the page both ask.
 */

export type SetupState =
  | {
      status: "configured";
      userId: string;
      householdId: string;
      householdName: string;
      /** IANA zone the household lives in; decides what "today" means. */
      timezone: string | null;
      learnerId: string;
      learnerName: string;
      learnerStage: string | null;
      examSeries: string | null;
      activeTermId: string | null;
      term: TermSummary | null;
      onboardingComplete: boolean;
      role: string;
    }
  | { status: "signed-out"; reason: string }
  | { status: "unconfigured"; reason: string; householdName?: string };

export function onboardingBypass() {
  return process.env.ONBOARDING_BYPASS === "true";
}

/** The demo workspace is for screenshots only; it never reads Postgres. */
export function demoMode() {
  return process.env.DEMO_MODE === "true";
}

export const getSetupState = cache(async (): Promise<SetupState> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { status: "unconfigured", reason: "database-not-configured" };
  }

  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { status: "signed-out", reason: "no-session" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, household_id, role")
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle<{ id: string; household_id: string | null; role: string }>();

    if (!profile?.household_id) {
      // A user exists but their own profile is unreadable, which means the
      // access token is not usable (an expired or revoked session). Say so
      // instead of showing an empty household that looks like missing data.
      return profile ? { status: "unconfigured", reason: "no-household" } : { status: "signed-out", reason: "session-invalid" };
    }

    const [{ data: household }, { data: learner }] = await Promise.all([
      supabase
        .from("households")
        .select("id, name, onboarding_completed, timezone")
        .eq("id", profile.household_id)
        .maybeSingle<{ id: string; name: string; onboarding_completed: boolean }>(),
      supabase
        .from("profiles")
        .select("id, display_name, year_group, target_exam_series")
        .eq("household_id", profile.household_id)
        .eq("role", "student")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{
          id: string;
          display_name: string;
          year_group: string | null;
          target_exam_series: string | null;
        }>(),
    ]);

    if (!household) return { status: "unconfigured", reason: "no-household" };
    if (!learner) return { status: "unconfigured", reason: "no-learner", householdName: household.name };

    const { data: terms } = await supabase
      .from("academic_terms")
      .select("id, name, status, start_date, end_date, midterm_exam_start, final_exam_start, daily_minutes_cap")
      .eq("household_id", household.id)
      .order("start_date", { ascending: true });

    const term = pickActiveTerm((terms ?? []).map((row, index) => toTermSummary(row, index)));

    return {
      status: "configured",
      userId: user.id,
      householdId: household.id,
      householdName: household.name,
      timezone: (household as { timezone?: string | null }).timezone ?? null,
      learnerId: learner.id,
      learnerName: learner.display_name,
      learnerStage: learner.year_group,
      examSeries: learner.target_exam_series,
      activeTermId: term?.id ?? null,
      term,
      onboardingComplete: household.onboarding_completed,
      role: profile.role,
    };
  } catch (error) {
    return { status: "unconfigured", reason: (error as Error).message };
  }
});

/** Learner-facing identity, falling back to a neutral label, never a persona. */
export function displayLearner(state: SetupState, fallback: string) {
  return state.status === "configured" ? state.learnerName : fallback;
}
