import { createServerClientInstance } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/storage/rules";

/**
 * Every table that holds a household's own rows (Phase 8 export). Curriculum tables are left out:
 * they are Cambridge configuration, the same for every household, and re-importable.
 */
export const HOUSEHOLD_TABLES = [
  "households",
  "profiles",
  "academic_terms",
  "learner_term_enrollments",
  "focus_policies",
  "timetable_slots",
  "timetable_overrides",
  "day_plan_items",
  "learning_events",
  "fsrs_retention_items",
  "fsrs_review_log",
  "mistake_notebook",
  "question_templates",
  "term_assessments",
  "assessment_items",
  "assessment_sittings",
  "assessment_responses",
  "assessment_item_marks",
  "evidence_portfolio",
  "trivia_modules",
  "trivia_questions",
  "learner_trivia_questions",
  "learner_questions",
  "requests",
  "messages",
  "notifications",
  "devices",
  "kiosk_sessions",
  "pin_attempt_logs",
  "audit_log",
] as const;

/** Columns that are secrets or device plumbing, not the household's data. */
const OMIT: Partial<Record<(typeof HOUSEHOLD_TABLES)[number], string[]>> = {
  devices: ["pairing_code_hash", "auth_user_id"],
};

const FILE_LINK_DAYS = 7;

export type HouseholdExport = {
  format: "openigcse-household-export";
  version: 1;
  exportedAt: string;
  householdId: string;
  tables: Record<string, unknown[]>;
  /** Evidence, photos and voice notes: each with a download link valid for seven days. */
  files: { path: string; size: number | null; url: string | null }[];
  errors: string[];
};

async function listFiles(prefix: string, supabase: Awaited<ReturnType<typeof createServerClientInstance>>): Promise<{ path: string; size: number | null }[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const out: { path: string; size: number | null }[] = [];
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    // Folders come back without an id.
    if (entry.id === null) out.push(...(await listFiles(path, supabase)));
    else out.push({ path, size: (entry.metadata as { size?: number } | null)?.size ?? null });
  }
  return out;
}

/**
 * Reads the caller's household through the session client, so RLS decides what is included,
 * exactly as it does on screen. A table that cannot be read is named in `errors`, not skipped quietly.
 */
export async function buildHouseholdExport(householdId: string): Promise<HouseholdExport> {
  const supabase = await createServerClientInstance();
  const tables: Record<string, unknown[]> = {};
  const errors: string[] = [];

  await Promise.all(
    HOUSEHOLD_TABLES.map(async (table) => {
      const { data, error } = await supabase.from(table).select("*").limit(50000);
      if (error) {
        errors.push(`${table}: ${error.message}`);
        return;
      }
      const omit = OMIT[table] ?? [];
      tables[table] = (data ?? []).map((row) =>
        Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([key]) => !omit.includes(key))),
      );
    }),
  );

  const found = await listFiles(householdId, supabase);
  const links = new Map<string, string>();
  for (let i = 0; i < found.length; i += 100) {
    const batch = found.slice(i, i + 100).map((file) => file.path);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(batch, FILE_LINK_DAYS * 24 * 60 * 60);
    if (error) errors.push(`files: ${error.message}`);
    for (const item of data ?? []) if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
  }

  return {
    format: "openigcse-household-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    householdId,
    tables,
    files: found.map((file) => ({ ...file, url: links.get(file.path) ?? null })),
    errors: errors.sort(),
  };
}
