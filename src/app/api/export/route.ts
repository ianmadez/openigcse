import { NextResponse } from "next/server";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { buildHouseholdExport } from "@/lib/data/export";

export const dynamic = "force-dynamic";

/** Phase 8: the household's own data as one JSON file, with seven-day links to every stored file. */
export async function GET() {
  const guardian = await requireGuardianSession();
  if (!guardian.ok) return NextResponse.json({ error: guardian.error }, { status: 403 });

  const data = await buildHouseholdExport(guardian.session.householdId);
  const day = data.exportedAt.slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="openigcse-export-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
