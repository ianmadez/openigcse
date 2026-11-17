import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request and drops the session
 * of a device the parent has revoked. Without the refresh an idle tab would be
 * signed out mid-session; without the revocation check a revoked device would
 * keep a valid JWT until it expired.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Student devices are the only sessions that can be revoked, so only check
  // when the request is outside the guardian area.
  if (user && !request.nextUrl.pathname.startsWith("/parent")) {
    const { data: state } = await supabase.rpc("device_session_state");

    if (state === "revoked") {
      const redirect = NextResponse.redirect(new URL("/pair?revoked=1", request.url));
      request.cookies
        .getAll()
        .filter((cookie) => cookie.name.startsWith("sb-"))
        .forEach((cookie) => redirect.cookies.delete(cookie.name));
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
