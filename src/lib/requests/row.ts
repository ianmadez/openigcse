import { isRequestType, type RequestStatus, type RequestType } from "@/lib/requests/catalog";

/** A request row as the app uses it. Shared by the server reads and the Realtime payloads. */
export type StudyRequest = {
  id: string;
  studentId: string;
  type: RequestType;
  status: RequestStatus;
  decision: string | null;
  studentNote: string | null;
  parentReply: string | null;
  effectUntil: string | null;
  dayPlanItemId: string | null;
  termAssessmentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
};

export type RequestRow = {
  id: string;
  student_id: string;
  request_type: string;
  status: string | null;
  decision: string | null;
  student_note: string | null;
  parent_reply: string | null;
  effect_until: string | null;
  day_plan_item_id: string | null;
  term_assessment_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
};

export function toRequest(row: RequestRow): StudyRequest | null {
  if (!isRequestType(row.request_type)) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    type: row.request_type,
    status: (row.status ?? "pending") as RequestStatus,
    decision: row.decision,
    studentNote: row.student_note,
    parentReply: row.parent_reply,
    effectUntil: row.effect_until,
    dayPlanItemId: row.day_plan_item_id,
    termAssessmentId: row.term_assessment_id,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/** Folds one Realtime change into a newest-first list. */
export function applyRequestChange(list: StudyRequest[], row: RequestRow | null, event: string): StudyRequest[] {
  if (!row) return list;
  const next = toRequest(row);
  if (!next) return list;
  if (event === "DELETE") return list.filter((entry) => entry.id !== next.id);
  const exists = list.some((entry) => entry.id === next.id);
  return exists ? list.map((entry) => (entry.id === next.id ? next : entry)) : [next, ...list];
}
