/**
 * Multi-tenant RLS verification.
 *
 *   pnpm test:rls
 *
 * Runs against the linked Supabase project with the anon key, which is exactly
 * what an unauthenticated browser gets. Set RLS_TEST_STUDENT_EMAIL and
 * RLS_TEST_STUDENT_PASSWORD to add the student-session checks.
 *
 * The write probes deliberately use values that cannot be satisfied (random
 * household ids, random term ids), so a passing test can never leave a row
 * behind: if RLS lets the insert through, the foreign key rejects it and that
 * comes back as a different error code, which fails the test.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    if (process.env[key]) continue;

    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Tables whose rows belong to exactly one household. */
const TENANT_TABLES = [
  "households",
  "profiles",
  "academic_terms",
  "term_assessments",
  "focus_policies",
  "requests",
  "devices",
];

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
}

function isDenied(error: { code?: string; message: string } | null) {
  if (!error) return false;
  // 42501 is both "permission denied for table" (missing grant) and the RLS
  // WITH CHECK violation, which is what these probes assert.
  return error.code === "42501" || /row-level security|permission denied/i.test(error.message);
}

async function readProbe(client: SupabaseClient, table: string) {
  const { data, error, count } = await client.from(table).select("id", { count: "exact", head: true });

  if (error) {
    return {
      ok: isDenied(error),
      detail: isDenied(error) ? `blocked (${error.code ?? "denied"})` : `${error.code ?? "error"}: ${error.message}`,
    };
  }

  const rows = count ?? data?.length ?? 0;
  return { ok: rows === 0, detail: `${rows} row(s) visible` };
}

type Probe = { table: string; row: Record<string, unknown> };

function writeProbes(): Probe[] {
  const missingHousehold = randomUUID();
  const missingTerm = randomUUID();

  return [
    {
      table: "academic_terms",
      row: {
        household_id: missingHousehold,
        name: "rls probe",
        start_date: "2026-01-05",
        end_date: "2026-04-05",
      },
    },
    {
      table: "term_assessments",
      row: {
        academic_term_id: missingTerm,
        assessment_category: "WeeklyQuiz",
        title: "rls probe",
        total_marks: 1,
      },
    },
    {
      table: "focus_policies",
      row: { household_id: missingHousehold },
    },
    {
      table: "question_templates",
      row: {
        question_type: "MCQ",
        prompt_template: "rls probe",
        mark_scheme_rubric: "rls probe",
        max_marks: 1,
      },
    },
  ];
}

async function writeProbe(client: SupabaseClient, probe: Probe) {
  const { error } = await client.from(probe.table).insert(probe.row);

  if (!error) return { ok: false, detail: "insert was accepted" };
  if (isDenied(error)) return { ok: true, detail: `blocked (${error.code ?? "denied"})` };

  // Anything else (a foreign key violation, for example) means RLS let the row
  // through and a constraint saved us — that is still a failure.
  return { ok: false, detail: `${error.code ?? "error"}: ${error.message}` };
}

async function main() {
  if (!url || !anonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.local.");
    process.exit(1);
  }

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log("Unauthenticated client");
  for (const table of TENANT_TABLES) {
    const probe = await readProbe(anon, table);
    record(`${table}: no rows without a session`, probe.ok, probe.detail);
  }

  for (const probe of writeProbes()) {
    const result = await writeProbe(anon, probe);
    record(`${probe.table}: insert without a session is refused`, result.ok, result.detail);
  }

  const email = process.env.RLS_TEST_STUDENT_EMAIL;
  const password = process.env.RLS_TEST_STUDENT_PASSWORD;

  if (!email || !password) {
    console.log("\nStudent session");
    console.log(
      "  skipped - set RLS_TEST_STUDENT_EMAIL and RLS_TEST_STUDENT_PASSWORD to check a learner session too.",
    );
  } else {
    console.log("\nStudent session");
    const student = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await student.auth.signInWithPassword({ email, password });

    if (signInError) {
      record("student sign-in", false, signInError.message);
    } else {
      const { data: profiles, error: profileError } = await student
        .from("profiles")
        .select("id, household_id, role");

      if (profileError) {
        record("student sees only its own household's profiles", false, profileError.message);
      } else {
        const householdIds = new Set((profiles ?? []).map((row) => row.household_id));
        record(
          "student sees only its own household's profiles",
          Boolean(profiles?.length) && householdIds.size === 1 && !householdIds.has(null),
          `${profiles?.length ?? 0} profile(s) across ${householdIds.size} household(s)`,
        );
      }

      const { count, error: householdError } = await student
        .from("households")
        .select("id", { count: "exact", head: true });

      record(
        "student sees exactly one household",
        !householdError && count === 1,
        householdError ? householdError.message : `${count ?? 0} household(s)`,
      );

      for (const probe of writeProbes()) {
        const result = await writeProbe(student, probe);
        record(`${probe.table}: student insert is refused`, result.ok, result.detail);
      }
    }
  }

  console.log("");
  for (const result of results) {
    console.log(`${result.ok ? "  ok  " : " FAIL "} ${result.name} - ${result.detail}`);
  }

  const failed = results.filter((result) => !result.ok);

  console.log("");
  console.log(`${results.length - failed.length}/${results.length} checks passed`);

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
