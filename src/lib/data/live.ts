import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * The live monitor (Step 5.4). The study device calls `record_heartbeat()` every 30 seconds; the
 * parent reads today's `kiosk_sessions` row and acts through `parent_live_action()`.
 */

export type HeartbeatInput = { route: string; itemId: string | null; focus: "visible" | "hidden" | "blurred"; timerRunning: boolean };

export async function recordHeartbeat(input: HeartbeatInput) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("record_heartbeat", {
    p_route: input.route,
    p_item: input.itemId,
    p_focus: input.focus,
    p_timer_running: input.timerRunning,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = (data as Array<{ session_id: string; screen_message: string | null; screen_message_at: string | null; day_ended: boolean }>)?.[0];
  return {
    ok: true as const,
    sessionId: row?.session_id ?? null,
    screenMessage: row?.screen_message ?? null,
    screenMessageAt: row?.screen_message_at ?? null,
    dayEnded: Boolean(row?.day_ended),
  };
}

export type LiveSession = {
  id: string;
  sessionDate: string;
  currentRoute: string | null;
  currentItemId: string | null;
  focusState: string | null;
  timerRunning: boolean;
  lastHeartbeatAt: string | null;
  idleSince: string | null;
  unfocusedCount: number;
  screenMessage: string | null;
  dayEndedAt: string | null;
};

export const LIVE_SESSION_COLUMNS =
  "id, session_date, current_route, current_item_id, focus_state, timer_running, last_heartbeat_at, idle_since, unfocused_count, screen_message, day_ended_at";

export function toLiveSession(row: Record<string, unknown>): LiveSession {
  return {
    id: row.id as string,
    sessionDate: row.session_date as string,
    currentRoute: (row.current_route as string) ?? null,
    currentItemId: (row.current_item_id as string) ?? null,
    focusState: (row.focus_state as string) ?? null,
    timerRunning: Boolean(row.timer_running),
    lastHeartbeatAt: (row.last_heartbeat_at as string) ?? null,
    idleSince: (row.idle_since as string) ?? null,
    unfocusedCount: Number(row.unfocused_count ?? 0),
    screenMessage: (row.screen_message as string) ?? null,
    dayEndedAt: (row.day_ended_at as string) ?? null,
  };
}

export async function getLiveSession(learnerId: string, date: string): Promise<LiveSession | null> {
  if (!learnerId) return null;
  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("kiosk_sessions")
    .select(LIVE_SESSION_COLUMNS)
    .eq("student_id", learnerId)
    .eq("session_date", date)
    .maybeSingle();
  return data ? toLiveSession(data) : null;
}

export type LiveAction = "end_break" | "message" | "unlock" | "lock" | "end_day";

export async function parentLiveAction(action: LiveAction, minutes?: number, message?: string) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("parent_live_action", {
    p_action: action,
    p_minutes: minutes ?? null,
    p_message: message ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, message: (data as string) ?? "Done." };
}
