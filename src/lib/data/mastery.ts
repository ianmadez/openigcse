import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * Read-side mastery (Step 4.4). `objective_mastery()` computes it in Postgres from the learner's
 * events and FSRS card; nothing stores it, so it cannot drift.
 */

export type ObjectiveMastery = {
  objectiveId: string;
  mastery: number;
  eventMastery: number;
  retrievability: number;
  /** True when the objective has at least one recorded event (a lesson counts). */
  covered: boolean;
  lastEventAt: string | null;
};

type MasteryRow = {
  objective_id: string;
  mastery: number | string;
  event_mastery: number | string;
  retrievability: number | string;
  covered: boolean;
  last_event_at: string | null;
};

export async function getObjectiveMastery(
  learnerId: string,
): Promise<{ items: ObjectiveMastery[]; error: string | null }> {
  if (!learnerId) return { items: [], error: null };

  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("objective_mastery", { p_student: learnerId });
  if (error) return { items: [], error: error.message };

  return {
    items: ((data ?? []) as MasteryRow[]).map((row) => ({
      objectiveId: row.objective_id,
      mastery: Number(row.mastery),
      eventMastery: Number(row.event_mastery),
      retrievability: Number(row.retrievability),
      covered: Boolean(row.covered),
      lastEventAt: row.last_event_at,
    })),
    error: null,
  };
}

/** Reviews that answered a previous card, and how many of them beat its due date. */
export async function getReviewCompliance(
  learnerId: string,
): Promise<{ reviews: number; onTime: number; error: string | null }> {
  if (!learnerId) return { reviews: 0, onTime: 0, error: null };

  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("review_compliance", { p_student: learnerId });
  if (error) return { reviews: 0, onTime: 0, error: error.message };

  const row = (data as Array<{ reviews: number; on_time: number }> | null)?.[0];
  return { reviews: Number(row?.reviews ?? 0), onTime: Number(row?.on_time ?? 0), error: null };
}
