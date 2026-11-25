import { BUCKET, storagePath, validateUpload, type FileKind } from "@/lib/storage/rules";
import { createServerClientInstance } from "@/lib/supabase/server";

export type UploadResult =
  | { ok: true; path: string; mimeType: string; size: number }
  | { ok: false; error: string };

/**
 * Uploads through the caller's own session, so the storage policies decide
 * whether this person may write into this household's folder.
 */
export async function uploadHouseholdFile(
  householdId: string,
  kind: FileKind,
  profileId: string,
  file: File,
): Promise<UploadResult> {
  const check = validateUpload({ type: file.type, size: file.size });
  if (!check.ok) return check;

  const path = storagePath(householdId, kind, profileId, check.extension);
  const supabase = await createServerClientInstance();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type.split(";")[0]!.trim(), upsert: false });

  if (error) return { ok: false, error: `Upload refused: ${error.message}` };
  return { ok: true, path, mimeType: file.type, size: file.size };
}

/** Short-lived links for private files. Paths the caller cannot read are left out. */
export async function signedUrls(paths: string[], expiresInSeconds = 60 * 60): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const wanted = [...new Set(paths.filter(Boolean))];
  if (wanted.length === 0) return urls;

  const supabase = await createServerClientInstance();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(wanted, expiresInSeconds);

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

export async function removeHouseholdFiles(paths: string[]) {
  if (paths.length === 0) return { ok: true as const };
  const supabase = await createServerClientInstance();
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
