import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * PERF_LOG=1 prints each Supabase request's start, duration and path, to find queries that wait
 * on each other. Off by default; nothing is logged in normal use.
 */
const timedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const response = await fetch(input, init);
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  console.log(`[perf] start=${Math.round(started)} took=${Math.round(performance.now() - started)}ms ${init?.method ?? "GET"} ${url.pathname}${url.search.slice(0, 90)}`);
  return response;
};

export const createServerClientInstance = async () => {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...(process.env.PERF_LOG === "1" ? { global: { fetch: timedFetch } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Invoked from Server Component; ignore write attempts
        }
      },
    },
  });
};
