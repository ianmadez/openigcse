"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { getAuthContext } from "@/lib/auth/session";
import { uploadHouseholdFile } from "@/lib/data/files";
import { parentLiveAction, recordHeartbeat, type LiveAction } from "@/lib/data/live";
import { getThread, markThreadRead, sendMessage } from "@/lib/data/messages";
import {
  deletePushSubscription,
  getNotifications,
  markNotificationsRead,
  savePushSubscription,
  saveQuietHours,
} from "@/lib/data/notifications";
import { pushPending } from "@/lib/push/notify";

/**
 * Writes shared by both shells (Phase 5): the household thread, the notification centre, push
 * registration and the study device's heartbeat. Each resolves the caller from its own session;
 * RLS decides the rest.
 */

async function caller() {
  const context = await getAuthContext();
  if (!context?.profileId || !context.householdId) return null;
  return { profileId: context.profileId, householdId: context.householdId, role: context.role };
}

export async function sendMessageAction(formData: FormData) {
  const who = await caller();
  if (!who) return { ok: false as const, error: "Sign in to send messages." };

  const body = String(formData.get("body") ?? "").trim();
  const file = formData.get("file");
  const kind = String(formData.get("kind") ?? "");
  if (body.length > 1000) return { ok: false as const, error: "Messages can be up to 1000 characters." };

  let attachmentPath: string | null = null;
  let attachmentKind: "image" | "voice" | null = null;
  if (file instanceof File && file.size > 0) {
    attachmentKind = kind === "voice" || file.type.startsWith("audio/") ? "voice" : "image";
    if (attachmentKind === "image" && !file.type.startsWith("image/")) {
      return { ok: false as const, error: "Attach a photo (JPEG, PNG or WebP) or record a voice note." };
    }
    const upload = await uploadHouseholdFile(who.householdId, "messages", who.profileId, file);
    if (!upload.ok) return upload;
    attachmentPath = upload.path;
  }
  if (!body && !attachmentPath) return { ok: false as const, error: "Write something or attach a file." };

  const result = await sendMessage({ householdId: who.householdId, senderId: who.profileId, body, attachmentPath, attachmentKind });
  if (!result.ok) return result;

  const householdId = who.householdId;
  after(async () => {
    await pushPending(householdId, ["message"]).catch(() => null);
  });
  revalidatePath("/messages");
  revalidatePath("/parent/messages");
  return { ok: true as const, id: result.id };
}

export async function threadAction() {
  const who = await caller();
  if (!who) return { ok: false as const, error: "Sign in to read messages.", messages: [] };
  return { ok: true as const, messages: await getThread(who.householdId) };
}

export async function markThreadReadAction() {
  const who = await caller();
  if (!who) return { ok: false as const, error: "Not signed in." };
  return markThreadRead();
}

export async function notificationsAction() {
  const who = await caller();
  if (!who) return { ok: false as const, items: [] };
  return { ok: true as const, items: await getNotifications(20) };
}

export async function markNotificationsReadAction(ids?: string[]) {
  const who = await caller();
  if (!who) return { ok: false as const, error: "Not signed in." };
  const parsed = z.array(z.string().uuid()).max(50).optional().safeParse(ids);
  if (!parsed.success) return { ok: false as const, error: "Those notifications could not be read." };
  return markNotificationsRead(parsed.data);
}

export async function savePushSubscriptionAction(input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
  const who = await caller();
  if (!who) return { ok: false as const, error: "Sign in first." };
  const parsed = z
    .object({
      endpoint: z.string().url().max(1000),
      p256dh: z.string().min(10).max(200),
      auth: z.string().min(8).max(100),
      userAgent: z.string().max(300).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "The browser sent a subscription that could not be read." };
  return savePushSubscription({
    householdId: who.householdId,
    profileId: who.profileId,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.p256dh,
    auth: parsed.data.auth,
    userAgent: parsed.data.userAgent ?? null,
  });
}

export async function deletePushSubscriptionAction(endpoint: string) {
  const who = await caller();
  if (!who) return { ok: false as const, error: "Sign in first." };
  return deletePushSubscription(endpoint);
}

export async function heartbeatAction(input: { route: string; itemId: string | null; focus: string; timerRunning: boolean }) {
  // record_heartbeat() refuses anyone but the signed-in learner.
  const parsed = z
    .object({
      route: z.string().max(200),
      itemId: z.string().uuid().nullable(),
      focus: z.enum(["visible", "hidden", "blurred"]),
      timerRunning: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Heartbeat could not be read." };
  const result = await recordHeartbeat(parsed.data);
  // The heartbeat may have written an idle alert or the digest; push whatever is unsent.
  if (result.ok) {
    after(async () => {
      const who = await caller().catch(() => null);
      if (who) await pushPending(who.householdId, ["idle", "digest"]).catch(() => null);
    });
  }
  return result;
}

export async function liveAction(input: { action: string; minutes?: number; message?: string }) {
  // parent_live_action() refuses anyone but a guardian of the household.
  const parsed = z
    .object({
      action: z.enum(["end_break", "message", "unlock", "lock", "end_day"]),
      minutes: z.number().int().min(5).max(120).optional(),
      message: z.string().trim().max(280).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That action could not be read." };
  const result = await parentLiveAction(parsed.data.action as LiveAction, parsed.data.minutes, parsed.data.message);
  if (result.ok && parsed.data.action === "end_day") {
    after(async () => {
      const who = await caller().catch(() => null);
      if (who) await pushPending(who.householdId, ["digest"]).catch(() => null);
    });
  }
  revalidatePath("/parent/live");
  return result;
}

export async function saveQuietHoursAction(input: { start: string | null; end: string | null }) {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const time = z.string().regex(/^\d{2}:\d{2}$/).nullable();
  const parsed = z.object({ start: time, end: time }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Use 24-hour times like 21:00." };
  if ((parsed.data.start === null) !== (parsed.data.end === null)) {
    return { ok: false as const, error: "Set both a start and an end, or clear both." };
  }
  const result = await saveQuietHours(guard.session.householdId, parsed.data.start, parsed.data.end);
  if (result.ok) revalidatePath("/parent/settings");
  return result;
}
