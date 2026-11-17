import { createServerClientInstance } from "@/lib/supabase/server";

export type StudyRequest = {
  id: string;
  type: string;
  status: "pending" | "approved" | "declined" | "resolved";
  studentNote: string | null;
  parentReply: string | null;
  createdAt: string;
};

/** Requests the learner raised, newest first. Empty until Phase 5 ships asks. */
export async function getRequests(householdId: string, limit = 5): Promise<StudyRequest[]> {
  if (!householdId) return [];

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("requests")
    .select("id, request_type, status, student_note, parent_reply, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.request_type,
    status: (row.status ?? "pending") as StudyRequest["status"],
    studentNote: row.student_note,
    parentReply: row.parent_reply,
    createdAt: row.created_at,
  }));
}

export function pendingCount(requests: StudyRequest[]) {
  return requests.filter((request) => request.status === "pending").length;
}

const TYPE_LABEL: Record<string, string> = {
  stuck: "Stuck",
  break: "Break",
  done_early: "Finished early",
  reschedule: "Reschedule",
  unlock: "Unlock",
  mark_my_work: "Check my work",
};

export function requestLabel(type: string) {
  return TYPE_LABEL[type] ?? type;
}
