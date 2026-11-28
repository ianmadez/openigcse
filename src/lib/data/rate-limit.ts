import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { createServerClientInstance } from "@/lib/supabase/server";

/** Limits per bucket: attempts allowed inside the window (Phase 8). */
export const LIMITS = {
  "sign-in": { max: 10, windowSeconds: 15 * 60 },
  "sign-in-ip": { max: 30, windowSeconds: 15 * 60 },
  "magic-link": { max: 5, windowSeconds: 15 * 60 },
  pairing: { max: 5, windowSeconds: 15 * 60 },
} as const;

export type LimitBucket = keyof typeof LIMITS;

export async function clientIp() {
  const store = await headers();
  return (store.get("x-forwarded-for")?.split(",")[0] ?? store.get("x-real-ip") ?? "unknown").trim();
}

function hashKey(parts: string[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Records one attempt and returns null when it is allowed, or a message saying how long to wait.
 * A failure to reach the limiter is reported, not ignored, so a broken limiter cannot become an open door.
 */
export async function checkRateLimit(bucket: LimitBucket, ...keyParts: string[]): Promise<string | null> {
  const { max, windowSeconds } = LIMITS[bucket];
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("hit_rate_limit", {
    p_bucket: bucket,
    p_key: hashKey(keyParts),
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) return "Sign-in is unavailable right now. Try again in a minute.";
  const wait = Number(data ?? 0);
  if (wait <= 0) return null;

  const minutes = Math.ceil(wait / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
