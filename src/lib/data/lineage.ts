import { createServerClientInstance } from "@/lib/supabase/server";

/**
 * Step 6.4: progress that still sits on retired objectives with a confirmed
 * successor, and the guardian action that moves it. Reads go through the
 * session client, so RLS limits the counts to this household.
 */

export type CarryOverStatus = { links: number; waiting: number; error: string | null };

export async function getCarryOverStatus(): Promise<CarryOverStatus> {
  const supabase = await createServerClientInstance();
  const { data: links, error } = await supabase.from("objective_lineage").select("from_objective_id");
  if (error) return { links: 0, waiting: 0, error: error.message };
  const fromIds = (links ?? []).map((row) => row.from_objective_id as string);
  if (fromIds.length === 0) return { links: 0, waiting: 0, error: null };

  const tables = ["learning_events", "mistake_notebook", "fsrs_retention_items"] as const;
  let waiting = 0;
  for (const table of tables) {
    const { count, error: countError } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("objective_id", fromIds);
    if (countError) return { links: fromIds.length, waiting, error: countError.message };
    waiting += count ?? 0;
  }
  return { links: fromIds.length, waiting, error: null };
}

export async function carryOverProgress(): Promise<
  { ok: true; moved: Record<string, number> } | { ok: false; error: string }
> {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("carry_over_objective_progress");
  if (error) return { ok: false, error: error.message };
  return { ok: true, moved: (data ?? {}) as Record<string, number> };
}
