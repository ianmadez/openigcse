import { createHash, randomInt } from "node:crypto";
import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClientInstance } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  profileId: string | null;
  householdId: string | null;
  role: string | null;
};

/**
 * The signed-in Supabase user, or null on a device with no session. Asking Supabase Auth is a
 * network round trip, so it happens once per request however many callers ask.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

/**
 * Resolves the caller's profile. A profile may be keyed by the auth user id
 * itself (legacy rows) or paired to it through `auth_user_id` (student devices
 * and guardians created since Phase 0).
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, household_id, role")
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .limit(1)
    .maybeSingle<{ id: string; household_id: string | null; role: string }>();

  return {
    userId: user.id,
    profileId: data?.id ?? null,
    householdId: data?.household_id ?? null,
    role: data?.role ?? null,
  };
});

/** Six digits is short enough to read aloud and still 1-in-a-million to guess. */
export function generatePairingCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Pairing codes are stored hashed so a leaked database dump cannot be replayed
 * as a device pairing. SHA-256 is enough here because the code is single-use
 * and expires in minutes.
 */
export function hashPairingCode(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}
