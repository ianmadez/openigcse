/** The one private bucket created by 20261117000001; policies key on the path. */
export const BUCKET = "household-files";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const ACCEPT = Object.keys(EXTENSION).join(",");

export type FileKind = "questions" | "working" | "evidence";

export function validateUpload(file: { type: string; size: number }):
  | { ok: true; extension: string }
  | { ok: false; error: string } {
  const extension = EXTENSION[file.type];
  if (!extension) return { ok: false, error: "Use a JPEG, PNG, WebP or PDF file." };
  if (file.size <= 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files can be up to 15 MB." };
  return { ok: true, extension };
}

/** {household}/{kind}/{uploader}/{random}.{ext}: the storage policies read the first and third folders. */
export function storagePath(householdId: string, kind: FileKind, profileId: string, extension: string) {
  return `${householdId}/${kind}/${profileId}/${globalThis.crypto.randomUUID()}.${extension}`;
}
