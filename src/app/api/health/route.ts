import { NextResponse } from "next/server";

import { createServerClientInstance } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Uptime check (Phase 8). Answers 200 when the app runs and Postgres answers a read of public
 * curriculum configuration; 503 otherwise. It reveals no household data and no versions.
 */
export async function GET() {
  const started = Date.now();
  try {
    const supabase = await createServerClientInstance();
    const { error } = await supabase.from("awarding_bodies").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, database: "up", ms: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, database: "down", ms: Date.now() - started }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
