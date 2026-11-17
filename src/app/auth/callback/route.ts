import { NextResponse } from "next/server";

import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * Landing point for the email magic link. Supabase returns a one-time code
 * which has to be exchanged for a session cookie on the server.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/parent";

  if (code) {
    const supabase = await createServerClientInstance();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
