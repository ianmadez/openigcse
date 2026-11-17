import { createServerClientInstance } from "@/lib/supabase/server";

/** Academic terms for the household, in calendar order. */
export type TermSummary = {
  id: string;
  name: string;
  status: "upcoming" | "active" | "completed";
  startsOn: string;
  endsOn: string;
  midtermWeekStart: string | null;
  finalWeekStart: string | null;
  dailyMinutesCap: number;
  sequence: number;
};

type TermRow = {
  id: string;
  name: string;
  status: string | null;
  start_date: string;
  end_date: string;
  midterm_exam_start: string | null;
  final_exam_start: string | null;
  daily_minutes_cap: number | null;
};

/** The table has no sequence column, so calendar order is the sequence. */
export function toTermSummary(row: TermRow, index = 0): TermSummary {
  return {
    id: row.id,
    name: row.name,
    status: (row.status ?? "upcoming") as TermSummary["status"],
    startsOn: row.start_date,
    endsOn: row.end_date,
    midtermWeekStart: row.midterm_exam_start,
    finalWeekStart: row.final_exam_start,
    dailyMinutesCap: row.daily_minutes_cap ?? 120,
    sequence: index + 1,
  };
}

export async function getTerms(householdId: string): Promise<TermSummary[]> {
  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("academic_terms")
    .select("id, name, status, start_date, end_date, midterm_exam_start, final_exam_start, daily_minutes_cap")
    .eq("household_id", householdId)
    .order("start_date", { ascending: true });

  return (data ?? []).map((row, index) => toTermSummary(row as TermRow, index));
}

/**
 * The term the app should open on: the one marked active, otherwise the one
 * whose dates contain today, otherwise the next one to start.
 */
export function pickActiveTerm(terms: TermSummary[], now: Date = new Date()): TermSummary | null {
  if (terms.length === 0) return null;

  const today = now.toISOString().slice(0, 10);
  const flagged = terms.find((term) => term.status === "active");
  const containing = terms.find((term) => term.startsOn <= today && today <= term.endsOn);
  const next = terms.find((term) => term.startsOn > today);

  return flagged ?? containing ?? next ?? terms[terms.length - 1] ?? null;
}

export async function getActiveTerm(householdId: string): Promise<TermSummary | null> {
  return pickActiveTerm(await getTerms(householdId));
}
