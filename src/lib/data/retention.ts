import { createServerClientInstance } from "@/lib/supabase/server";

export type RetentionItem = {
  objectiveId: string;
  mastery: number;
  dueAt: string | null;
  status: string;
  reps: number;
};

/**
 * Derived FSRS state per objective. Empty until Phase 4 writes events, which is
 * why every mastery read has to tolerate a missing row.
 */
export async function getRetention(learnerId: string): Promise<RetentionItem[]> {
  if (!learnerId) return [];

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("fsrs_retention_items")
    .select("objective_id, composite_mastery, due_at, status, reps")
    .eq("student_id", learnerId);

  return (data ?? []).map((row) => ({
    objectiveId: row.objective_id,
    // composite_mastery is stored 0-100; the planner wants 0-1.
    mastery: Math.max(0, Math.min(1, (row.composite_mastery ?? 0) / 100)),
    dueAt: row.due_at,
    status: row.status ?? "New",
    reps: row.reps ?? 0,
  }));
}

export function masteryByObjective(items: RetentionItem[]) {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.objectiveId, item.mastery);
  return map;
}
