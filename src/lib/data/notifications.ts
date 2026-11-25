import { createServerClientInstance } from "@/lib/supabase/server";

/** The in-app notification centre (Step 5.3): the fallback when push is denied or quiet hours hold it. */

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function getNotifications(limit = 20): Promise<AppNotification[]> {
  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link_url, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as string,
    title: row.title as string,
    body: row.body as string,
    linkUrl: row.link_url as string | null,
    readAt: row.read_at as string | null,
    createdAt: row.created_at as string,
  }));
}

export async function markNotificationsRead(ids?: string[]) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: ids?.length ? ids : null });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function savePushSubscription(input: {
  householdId: string;
  profileId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}) {
  const supabase = await createServerClientInstance();
  // A browser keeps one endpoint per device; re-registering replaces the keys.
  await supabase.from("push_subscriptions").delete().eq("endpoint", input.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    household_id: input.householdId,
    profile_id: input.profileId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth_secret: input.auth,
    user_agent: input.userAgent,
  });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function deletePushSubscription(endpoint: string) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function getQuietHours(householdId: string) {
  const supabase = await createServerClientInstance();
  const { data } = await supabase.from("households").select("quiet_hours_start, quiet_hours_end").eq("id", householdId).maybeSingle();
  return {
    start: (data?.quiet_hours_start as string | null)?.slice(0, 5) ?? null,
    end: (data?.quiet_hours_end as string | null)?.slice(0, 5) ?? null,
  };
}

export async function saveQuietHours(householdId: string, start: string | null, end: string | null) {
  const supabase = await createServerClientInstance();
  const { error } = await supabase
    .from("households")
    .update({ quiet_hours_start: start, quiet_hours_end: end })
    .eq("id", householdId);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
