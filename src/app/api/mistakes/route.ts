import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  id: z.uuid(),
  resolved: z.boolean(),
});

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ persisted: false, problems: parsed.error.issues }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ persisted: false, reason: "database-not-configured" });
  }

  try {
    const client = createAdminClient();
    const { error } = await client
      .from("mistake_notebook")
      .update({ resolved: parsed.data.resolved })
      .eq("id", parsed.data.id);

    if (error) throw error;
    return NextResponse.json({ persisted: true });
  } catch (error) {
    return NextResponse.json({ persisted: false, reason: (error as Error).message });
  }
}
