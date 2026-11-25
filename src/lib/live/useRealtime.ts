"use client";

import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

let shared: SupabaseClient | null = null;

/** One browser client per tab; null when Supabase is not configured. */
export function browserClient() {
  if (shared) return shared;
  try {
    shared = createClient();
  } catch {
    shared = null;
  }
  return shared;
}

type Change = RealtimePostgresChangesPayload<Record<string, unknown>>;

/**
 * Subscribes to Postgres changes on one table (Phase 5). Supabase Realtime applies RLS with the
 * signed-in user's token, so a subscriber only ever hears about rows it could select.
 */
export function useRealtime(
  channel: string,
  table: string,
  filter: string | null,
  onChange: (change: Change) => void,
  events: "*" | "INSERT" | "UPDATE" = "*",
) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    const client = browserClient();
    if (!client) return;
    let cancelled = false;
    let subscription: ReturnType<SupabaseClient["channel"]> | null = null;

    (async () => {
      // Join with the signed-in user's token, or RLS hides every row from the subscription.
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) await client.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      // A fresh topic per mount: supabase-js returns an existing channel with the same name, and
      // React's dev double-mount would otherwise get the one being removed.
      subscription = client
        .channel(`${channel}:${Math.random().toString(36).slice(2, 10)}`)
        .on(
          "postgres_changes" as never,
          { event: events, schema: "public", table, ...(filter ? { filter } : {}) },
          (payload: Change) => handler.current(payload),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (subscription) client.removeChannel(subscription);
    };
  }, [channel, table, filter, events]);
}
