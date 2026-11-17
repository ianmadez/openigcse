import { getAuthContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActiveHousehold = {  householdId: string;
  /** The caller's own profile, when the device has an authenticated session. */
  profileId: string | null;
};

/**
 * Which household this request acts on.
 *
 * A signed-in guardian is authoritative. Devices that unlocked with the PIN
 * only have no session, so they fall back to the household created by
 * onboarding — the single-device install this app started as.
 */
export async function resolveActiveHousehold(): Promise<ActiveHousehold | null> {
  const context = await getAuthContext();

  if (context?.householdId) {
    return { householdId: context.householdId, profileId: context.profileId };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("households")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return data ? { householdId: data.id, profileId: null } : null;
}

export type LinkableMember = {
  profileId: string;
  name: string;
  relationship: string | null;
  role: string;
};

export type LinkableHousehold = {
  householdId: string;
  householdName: string;
  members: LinkableMember[];
};

/**
 * Households whose adult profiles have no auth account yet.
 *
 * Households created before Phase 0 have guardian profiles with no
 * `auth_user_id`, so a freshly signed-up person cannot see them under RLS. This
 * narrow lookup is the one place the service-role key is used for discovery:
 * the page lists the unlinked people and the caller links to the one they pick,
 * so nobody can silently adopt another person's row.
 */
export async function listLinkableProfiles(): Promise<LinkableHousehold | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, display_name, relationship, role, household_id, households!inner(id, name)")
    .in("role", ["parent_educator", "developer_admin"])
    .is("auth_user_id", null)
    .not("household_id", "is", null)
    .limit(10);

  if (!data?.length) return null;

  const rows = data as unknown as Array<{
    id: string;
    display_name: string;
    relationship: string | null;
    role: string;
    household_id: string;
    households: { id: string; name: string };
  }>;

  const first = rows[0];
  if (!first) return null;

  // Only the household the first candidate belongs to: one family per install.
  const members = rows
    .filter((row) => row.household_id === first.household_id)
    .map((row) => ({
      profileId: row.id,
      name: row.display_name,
      relationship: row.relationship,
      role: row.role,
    }));

  return {
    householdId: first.households.id,
    householdName: first.households.name,
    members,
  };
}

export type HouseholdSettings = {
  householdId: string;
  name: string;
  countryCode: string;
  zone: number;
  timezone: string;
  hasPin: boolean;
  guardian: { id: string; displayName: string; relationship: string | null } | null;
  learner: {
    id: string;
    displayName: string;
    yearGroup: string | null;
    candidateType: string | null;
    targetExamSeries: string | null;
  } | null;
  devices: {
    id: string;
    name: string;
    type: string;
    pairedAt: string | null;
    revokedAt: string | null;
    lastSeenAt: string | null;
    visibility: string | null;
    activeRoute: string | null;
    pairingExpiresAt: string | null;
  }[];
  focusPolicy: { isLocked: boolean; allowedRoutes: string[] } | null;
};

/** Everything the settings screen renders, in one round trip. */
export async function getHouseholdSettings(): Promise<HouseholdSettings | null> {
  const active = await resolveActiveHousehold();
  if (!active) return null;

  const admin = createAdminClient();
  const householdId = active.householdId;

  const [{ data: household }, { data: profiles }, { data: devices }, { data: policy }] = await Promise.all([
    admin
      .from("households")
      .select("id, name, country_code, cambridge_admin_zone, timezone, guardian_pin_hash")
      .eq("id", householdId)
      .maybeSingle<{
        id: string;
        name: string;
        country_code: string;
        cambridge_admin_zone: number;
        timezone: string;
        guardian_pin_hash: string | null;
      }>(),
    admin
      .from("profiles")
      .select("id, display_name, role, year_group, candidate_type, target_exam_series, relationship")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true }),
    admin
      .from("devices")
      .select("id, device_name, device_type, paired_at, revoked_at, last_seen_at, visibility_state, active_route, pairing_code_expires_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    admin
      .from("focus_policies")
      .select("is_locked, allowed_routes")
      .eq("household_id", householdId)
      .maybeSingle<{ is_locked: boolean; allowed_routes: string[] }>(),
  ]);

  if (!household) return null;

  const guardian = (profiles ?? []).find((row) => row.role !== "student") ?? null;
  const learner = (profiles ?? []).find((row) => row.role === "student") ?? null;

  return {
    householdId,
    name: household.name,
    countryCode: household.country_code,
    zone: household.cambridge_admin_zone,
    timezone: household.timezone,
    hasPin: Boolean(household.guardian_pin_hash),
    guardian: guardian
      ? { id: guardian.id, displayName: guardian.display_name, relationship: guardian.relationship ?? null }
      : null,
    learner: learner
      ? {
          id: learner.id,
          displayName: learner.display_name,
          yearGroup: learner.year_group ?? null,
          candidateType: learner.candidate_type ?? null,
          targetExamSeries: learner.target_exam_series ?? null,
        }
      : null,
    devices: (devices ?? []).map((device) => ({
      id: device.id,
      name: device.device_name,
      type: device.device_type,
      pairedAt: device.paired_at ?? null,
      revokedAt: device.revoked_at ?? null,
      lastSeenAt: device.last_seen_at ?? null,
      visibility: device.visibility_state ?? null,
      activeRoute: device.active_route ?? null,
      pairingExpiresAt: device.pairing_code_expires_at ?? null,
    })),
    focusPolicy: policy ? { isLocked: policy.is_locked, allowedRoutes: policy.allowed_routes } : null,
  };
}
