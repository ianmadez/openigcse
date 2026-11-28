import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/storage/rules";

/**
 * Deletes a whole household: stored files, every row (households cascade), and every sign-in
 * account that belonged to it. This is the second ruled service-role exception (Phase 8): auth
 * accounts and storage objects of other members cannot be removed through the session client.
 * The caller must already have checked the signed-in guardian, the PIN and the typed confirmation.
 */
export async function deleteHousehold(householdId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const { data: members, error: membersError } = await admin
    .from("profiles")
    .select("id, auth_user_id")
    .eq("household_id", householdId);
  if (membersError) return { ok: false, error: membersError.message };

  const { data: devices } = await admin.from("devices").select("auth_user_id").eq("household_id", householdId);

  // Files first: once the rows are gone nothing points at them.
  const paths: string[] = [];
  const walk = async (prefix: string) => {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error) throw new Error(error.message);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) await walk(path);
      else paths.push(path);
    }
  };
  try {
    await walk(householdId);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) return { ok: false, error: `Files could not be removed: ${error.message}` };
    }
  } catch (error) {
    return { ok: false, error: `Files could not be listed: ${(error as Error).message}` };
  }

  const { error: householdError } = await admin.from("households").delete().eq("id", householdId);
  if (householdError) return { ok: false, error: householdError.message };

  const accounts = new Set(
    [...(members ?? []).map((row) => row.auth_user_id), ...(devices ?? []).map((row) => row.auth_user_id)].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const failed: string[] = [];
  for (const id of accounts) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) failed.push(error.message);
  }
  if (failed.length) return { ok: false, error: `The household is deleted, but ${failed.length} sign-in account(s) remain: ${failed[0]}` };

  return { ok: true };
}
