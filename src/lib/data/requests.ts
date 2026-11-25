import { isRequestType, REQUESTS, type RequestType } from "@/lib/requests/catalog";
import { toRequest, type RequestRow, type StudyRequest } from "@/lib/requests/row";
import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * Structured requests (Step 5.1). The learner inserts a pending ask through RLS; a guardian
 * answers through `decide_request()`, which applies the effect in the same transaction.
 */

export type { StudyRequest };

export const REQUEST_COLUMNS =
  "id, student_id, request_type, status, decision, student_note, parent_reply, effect_until, day_plan_item_id, term_assessment_id, payload, created_at, resolved_at";

/** The household's requests, newest first. Stale pending asks are expired before reading. */
export async function getRequests(householdId: string, limit = 10): Promise<StudyRequest[]> {
  if (!householdId) return [];

  const supabase = await createServerClientInstance();
  await supabase.rpc("expire_stale_requests");
  const { data } = await supabase
    .from("requests")
    .select(REQUEST_COLUMNS)
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as RequestRow[]).flatMap((row) => toRequest(row) ?? []);
}

export function pendingCount(requests: StudyRequest[]) {
  return requests.filter((request) => request.status === "pending").length;
}

export function requestLabel(type: string) {
  return isRequestType(type) ? REQUESTS[type].label : type;
}

export type NewRequest = {
  type: RequestType;
  note?: string;
  dayPlanItemId?: string | null;
  termAssessmentId?: string | null;
  objectiveId?: string | null;
  payload?: Record<string, unknown>;
};

export async function createRequest(householdId: string, learnerId: string, input: NewRequest) {
  const supabase = await createServerClientInstance();
  const row = {
      household_id: householdId,
      student_id: learnerId,
      request_type: input.type,
      student_note: input.note?.trim() || null,
      day_plan_item_id: input.dayPlanItemId ?? null,
      term_assessment_id: input.termAssessmentId ?? null,
      learning_objective_id: input.objectiveId ?? null,
      payload: input.payload ?? {},
  };
  const insert = () => supabase.from("requests").insert(row).select("id").single();

  // One open ask of a type at a time (a partial unique index). A clash with a stale ask expires
  // it and tries once more; a clash with a live one means a second tap while waiting.
  let { data, error } = await insert();
  if (error?.code === "23505") {
    await supabase.rpc("expire_stale_requests");
    ({ data, error } = await insert());
    if (error?.code === "23505") return { ok: false as const, error: "You already asked. Waiting for an answer." };
  }
  if (error || !data) return { ok: false as const, error: error?.message ?? "The request was not saved." };
  return { ok: true as const, id: data.id as string };
}

export async function decideRequest(requestId: string, decision: string, note: string | null) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("decide_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_note: note,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = (data as Array<{ status: string; effect_until: string | null }> | null)?.[0];
  return { ok: true as const, status: row?.status ?? "approved", effectUntil: row?.effect_until ?? null };
}

/**
 * The learner's latest request plus any timed effect still running (a break or an unlock).
 * `breakSecondsLeft` is measured on the database clock, so a device with a wrong clock still
 * counts down the right amount.
 */
export async function getLearnerRequestState(learnerId: string) {
  if (!learnerId) return { latest: null, activeBreak: null, activeUnlock: null, breakSecondsLeft: 0, recent: [] };
  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("requests")
    .select(REQUEST_COLUMNS)
    .eq("student_id", learnerId)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = ((data ?? []) as RequestRow[]).flatMap((row) => toRequest(row) ?? []);
  const now = Date.now();
  const running = (type: RequestType) =>
    rows.find((row) => row.type === type && row.status === "approved" && row.effectUntil && Date.parse(row.effectUntil) > now) ??
    null;
  const activeBreak = running("break");
  let breakSecondsLeft = 0;
  if (activeBreak?.effectUntil) {
    const { data: left } = await supabase.rpc("seconds_left", { p_until: activeBreak.effectUntil });
    breakSecondsLeft = Number(left ?? 0);
  }
  return { latest: rows[0] ?? null, activeBreak, activeUnlock: running("unlock"), breakSecondsLeft, recent: rows };
}
