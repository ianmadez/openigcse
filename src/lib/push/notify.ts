import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";
import { inQuietHours } from "@/lib/push/quiet";

/**
 * Web Push delivery (Step 5.3).
 *
 * Ian's ruling (2026-11-25): this module is the one place app code uses the service-role client.
 * RLS lets each person read only their own push subscription, but a learner's request has to reach
 * the parent's phone, so something must read another profile's endpoint. It touches exactly three
 * things: `notifications` rows that have not been pushed yet, the recipients' `push_subscriptions`,
 * and the household's quiet hours. It never takes a recipient from its caller: it pushes the rows
 * the database triggers already wrote, so a caller cannot aim a push at anyone.
 */

let configured: boolean | null = null;

function configure() {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@openigcse.app", publicKey, privateKey);
  configured = true;
  return configured;
}

export type NotifyTarget = {
  /** Push the notifications a request's trigger wrote. */
  requestId?: string;
  /** Or push specific notification rows (messages, digests, idle alerts). */
  notificationIds?: string[];
  kind?: string;
};

/** Pushes this household's recent, not-yet-pushed notifications of the given kinds. */
export async function pushPending(householdId: string, kinds: string[]) {
  if (!configure()) return { sent: 0, skipped: "push is not configured" };
  const { data } = await createAdminClient()
    .from("notifications")
    .select("id")
    .eq("household_id", householdId)
    .in("kind", kinds)
    .is("pushed_at", null)
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString());
  const ids = (data ?? []).map((row) => row.id as string);
  return ids.length ? notifyRecipients({ notificationIds: ids }) : { sent: 0, skipped: "nothing to push" };
}

export async function notifyRecipients(target: NotifyTarget): Promise<{ sent: number; skipped: string | null }> {
  if (!configure()) return { sent: 0, skipped: "push is not configured" };
  const admin = createAdminClient();

  let query = admin
    .from("notifications")
    .select("id, household_id, recipient_profile_id, kind, title, body, link_url")
    .is("pushed_at", null)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
  if (target.requestId) query = query.eq("request_id", target.requestId);
  else if (target.notificationIds?.length) query = query.in("id", target.notificationIds);
  else return { sent: 0, skipped: "no target" };
  if (target.kind) query = query.eq("kind", target.kind);

  const { data: rows } = await query;
  if (!rows?.length) return { sent: 0, skipped: "nothing to push" };

  const householdIds = [...new Set(rows.map((row) => row.household_id as string))];
  const { data: households } = await admin
    .from("households")
    .select("id, timezone, quiet_hours_start, quiet_hours_end")
    .in("id", householdIds);
  const householdById = new Map((households ?? []).map((row) => [row.id as string, row]));

  const recipients = [...new Set(rows.map((row) => row.recipient_profile_id as string))];
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, p256dh, auth_secret")
    .in("profile_id", recipients);

  let sent = 0;
  const stale: string[] = [];
  const pushed: string[] = [];

  for (const row of rows) {
    const household = householdById.get(row.household_id as string);
    // Quiet hours hold the push; the in-app notification centre still shows the row.
    if (household && inQuietHours(new Date(), household.timezone, household.quiet_hours_start, household.quiet_hours_end)) {
      continue;
    }
    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.link_url ?? "/",
      tag: `${row.kind}-${row.id}`,
    });
    for (const subscription of (subscriptions ?? []).filter((entry) => entry.profile_id === row.recipient_profile_id)) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } },
          payload,
          { TTL: 600, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        console.warn(`push to ${new URL(subscription.endpoint).host} failed: ${status ?? ""} ${(error as Error).message}`);
        // 404/410: the browser dropped the subscription. Anything else is retried by nothing; the
        // in-app centre is the fallback.
        if (status === 404 || status === 410) stale.push(subscription.id as string);
      }
    }
    pushed.push(row.id as string);
  }

  if (pushed.length) await admin.from("notifications").update({ pushed_at: new Date().toISOString() }).in("id", pushed);
  if (stale.length) await admin.from("push_subscriptions").delete().in("id", stale);
  return { sent, skipped: null };
}
