import { readFile } from "node:fs/promises";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { syllabusPdfPath } from "@/lib/curriculum/packageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 6.3: the local syllabus PDF beside the extracted objectives. The PDFs are
 * Cambridge's copyright and never committed, so this only serves a file the
 * household downloaded into raw-syllabuses/, and only to an unlocked guardian.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const guard = await requireGuardianSession();
  if (!guard.ok) return new Response(guard.error, { status: 401 });

  const { code } = await params;
  if (!/^\d{4}$/.test(code)) return new Response("Unknown subject.", { status: 400 });

  const file = await syllabusPdfPath(code);
  if (!file) return new Response("This syllabus PDF has not been downloaded. See docs/syllabus-pdfs.md.", { status: 404 });

  return new Response(new Uint8Array(await readFile(file)), {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
