import { signedUrls } from "@/lib/data/files";
import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * The household thread (Step 5.2). One thread per household; text, a photo or a voice note.
 * Attachments live in the private bucket under {household}/messages/{sender}/ and are shown
 * through short-lived signed links.
 */

export type ThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  attachmentKind: "image" | "voice" | null;
  attachmentUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function getThread(householdId: string, limit = 60): Promise<ThreadMessage[]> {
  if (!householdId) return [];
  const supabase = await createServerClientInstance();
  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_profile_id, body, attachment_path, attachment_kind, read_at, created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("profiles").select("id, display_name, role").eq("household_id", householdId),
  ]);
  const personById = new Map((people ?? []).map((row) => [row.id as string, row]));
  const urls = await signedUrls((rows ?? []).map((row) => row.attachment_path as string).filter(Boolean));

  return (rows ?? [])
    .map((row) => {
      const sender = personById.get(row.sender_profile_id as string);
      return {
        id: row.id as string,
        senderId: row.sender_profile_id as string,
        senderName: (sender?.display_name as string) ?? "Someone",
        senderRole: (sender?.role as string) ?? "",
        body: row.body as string,
        attachmentKind: (row.attachment_kind as ThreadMessage["attachmentKind"]) ?? null,
        attachmentUrl: row.attachment_path ? (urls.get(row.attachment_path as string) ?? null) : null,
        readAt: row.read_at as string | null,
        createdAt: row.created_at as string,
      };
    })
    .reverse();
}

export async function sendMessage(input: {
  householdId: string;
  senderId: string;
  body: string;
  attachmentPath?: string | null;
  attachmentKind?: "image" | "voice" | null;
}) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      household_id: input.householdId,
      sender_profile_id: input.senderId,
      body: input.body.trim(),
      attachment_path: input.attachmentPath ?? null,
      attachment_kind: input.attachmentKind ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data.id as string };
}

export async function markThreadRead() {
  const supabase = await createServerClientInstance();
  const { error } = await supabase.rpc("mark_messages_read");
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function displayNameOf(profileId: string) {
  const supabase = await createServerClientInstance();
  const { data } = await supabase.from("profiles").select("display_name").eq("id", profileId).maybeSingle();
  return (data?.display_name as string | undefined) ?? null;
}

/** Messages sent to this profile that it has not read yet. */
export async function unreadMessageCount(householdId: string, profileId: string) {
  if (!householdId || !profileId) return 0;
  const supabase = await createServerClientInstance();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .neq("sender_profile_id", profileId)
    .is("read_at", null);
  return count ?? 0;
}
