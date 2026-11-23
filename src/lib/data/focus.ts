import { createServerClientInstance } from "@/lib/supabase/server";

export type FocusPolicy = {
  isLocked: boolean;
  allowedRoutes: string[];
  scheduledWindows: unknown;
  lockEndsAt: string | null;
  updatedAt: string | null;
};

/** The household's focus policy. One row per household, created by onboarding. */
export async function getFocusPolicy(householdId: string): Promise<FocusPolicy | null> {
  if (!householdId) return null;

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("focus_policies")
    .select("is_locked, allowed_routes, scheduled_windows, lock_ends_at, updated_at")
    .eq("household_id", householdId)
    .maybeSingle<{
      is_locked: boolean;
      allowed_routes: string[];
      scheduled_windows: unknown;
      lock_ends_at: string | null;
      updated_at: string | null;
    }>();

  if (!data) return null;

  return {
    isLocked: data.is_locked,
    allowedRoutes: data.allowed_routes ?? [],
    scheduledWindows: data.scheduled_windows,
    lockEndsAt: data.lock_ends_at,
    updatedAt: data.updated_at,
  };
}
