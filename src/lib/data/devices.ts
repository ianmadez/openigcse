import { createServerClientInstance } from "@/lib/supabase/server";

export type HouseholdDevice = {
  id: string;
  name: string;
  type: string;
  pairedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  activeRoute: string | null;
};

/** Devices the household has paired, newest first. */
export async function getDevices(householdId: string): Promise<HouseholdDevice[]> {
  if (!householdId) return [];

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("devices")
    .select("id, device_name, device_type, paired_at, revoked_at, last_seen_at, active_route")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.device_name,
    type: row.device_type,
    pairedAt: row.paired_at,
    revokedAt: row.revoked_at,
    lastSeenAt: row.last_seen_at,
    activeRoute: row.active_route,
  }));
}

export function onlineCount(devices: HouseholdDevice[], withinMinutes = 10) {
  const cutoff = Date.now() - withinMinutes * 60 * 1000;
  return devices.filter(
    (device) => !device.revokedAt && device.lastSeenAt && new Date(device.lastSeenAt).getTime() >= cutoff,
  ).length;
}
