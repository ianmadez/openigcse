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

export type TermInput = {
  /** Present for a term already on file; absent for a new one. */
  id?: string;
  name: string;
  startsOn: string;
  endsOn: string;
  midtermWeekStart: string | null;
  finalWeekStart: string | null;
};

/**
 * Writes the household's terms. A term on file is updated by id so its name can
 * never fork it into a second row; a new term is upserted on (household, name),
 * so saving the same new term twice still leaves one row.
 */
export async function saveTerms(householdId: string, terms: TermInput[]) {
  const supabase = await createServerClientInstance();

  for (const term of terms) {
    const row = {
      household_id: householdId,
      name: term.name,
      start_date: term.startsOn,
      end_date: term.endsOn,
      midterm_exam_start: term.midtermWeekStart,
      final_exam_start: term.finalWeekStart,
    };

    const { data, error } = term.id
      ? await supabase.from("academic_terms").update(row).eq("id", term.id).eq("household_id", householdId).select("id")
      : await supabase.from("academic_terms").upsert(row, { onConflict: "household_id,name" }).select("id");

    if (error) return { ok: false as const, error: `${term.name}: ${error.message}` };
    if (!data?.length) return { ok: false as const, error: `${term.name} was not saved. Sign in as the guardian and try again.` };
  }

  return { ok: true as const };
}
