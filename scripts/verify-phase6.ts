/**
 * Phase 6 at the database layer, with real JWTs: the command-word glossary, objective
 * lineage, retired objectives, and carry_over_objective_progress() moving one
 * household's progress along confirmed links without touching another household's.
 *
 * Builds a throwaway subject (code 9999) and two throwaway households; everything is
 * deleted in `finally`. Real households and real curriculum rows are never written.
 *
 *   pnpm verify:phase6
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnv } from "./lib/env";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TAG = `phase6-probe-${Date.now()}`;
const PASSWORD = `${randomUUID()}Aa1!`;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail && !ok ? ` - ${detail}` : ""}`);
}

const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const created = { households: [] as string[], users: [] as string[], subjects: [] as string[] };

type Person = { client: SupabaseClient; profileId: string };
type Household = { id: string; guardian: Person; learner: Person };

async function person(householdId: string, role: "parent_educator" | "student", label: string): Promise<Person> {
  const email = `${TAG}-${label}@example.com`;
  const { data: user, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !user.user) throw new Error(`createUser ${label}: ${error?.message}`);
  created.users.push(user.user.id);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ household_id: householdId, display_name: `${TAG} ${label}`, role, auth_user_id: user.user.id })
    .select("id")
    .single();
  if (profileError) throw new Error(`profile ${label}: ${profileError.message}`);
  const signedIn = client();
  const { error: signInError } = await signedIn.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`sign in ${label}: ${signInError.message}`);
  return { client: signedIn, profileId: profile.id };
}

async function household(label: string): Promise<Household> {
  const { data, error } = await admin.from("households").insert({ name: `${TAG} ${label}` }).select("id").single();
  if (error) throw new Error(`household ${label}: ${error.message}`);
  created.households.push(data.id);
  return {
    id: data.id,
    guardian: await person(data.id, "parent_educator", `${label}-guardian`),
    learner: await person(data.id, "student", `${label}-learner`),
  };
}

async function curriculum() {
  const { data: qualification } = await admin.from("qualifications").select("id").limit(1).single();
  if (!qualification) throw new Error("No qualification row to attach the probe subject to.");
  const { data: subject, error } = await admin
    .from("subjects")
    .insert({ qualification_id: qualification.id, subject_name: `${TAG} subject`, subject_code: "9999", category: "STEM" })
    .select("id")
    .single();
  if (error) throw new Error(`subject: ${error.message}`);
  created.subjects.push(subject.id);
  const { data: version, error: versionError } = await admin
    .from("syllabus_versions")
    .insert({ subject_id: subject.id, version_label: "2026-2028", exam_year_start: 2026, exam_year_end: 2028 })
    .select("id")
    .single();
  if (versionError) throw new Error(`version: ${versionError.message}`);
  const { data: topic } = await admin
    .from("topics")
    .insert({ syllabus_version_id: version.id, topic_code: "1.1", name: "Probe topic" })
    .select("id")
    .single();
  const objective = async (code: string, retired: boolean) => {
    const { data, error: objectiveError } = await admin
      .from("learning_objectives")
      .insert({
        topic_id: topic!.id,
        objective_code: code,
        summary_title: code,
        official_description: `Probe objective ${code}`,
        retired_at: retired ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (objectiveError) throw new Error(`objective ${code}: ${objectiveError.message}`);
    return data.id as string;
  };
  return {
    versionId: version.id as string,
    topicId: topic!.id as string,
    oldA: await objective("PR-9999-1.1.1~retired", true),
    oldB: await objective("PR-9999-1.1.2~retired", true),
    newA: await objective("PR-9999-1.1.1", false),
    newB: await objective("PR-9999-1.1.2", false),
  };
}

const event = (studentId: string, objectiveId: string) => ({
  student_id: studentId,
  objective_id: objectiveId,
  event_type: "Exposure_Lesson",
  score_ratio: 0,
});

async function run() {
  const c = await curriculum();
  const a = await household("a");
  const b = await household("b");

  // Glossary: readable by anyone signed in, writable only by staff.
  await admin.from("command_words").insert({ syllabus_version_id: c.versionId, word: "Describe", meaning: "state the points" });
  const { data: words } = await a.learner.client.from("command_words").select("word").eq("syllabus_version_id", c.versionId);
  check("a learner can read the command-word glossary", words?.length === 1);
  const { error: learnerWrite } = await a.learner.client
    .from("command_words")
    .insert({ syllabus_version_id: c.versionId, word: "Explain", meaning: "x" });
  check("a learner cannot write the glossary", Boolean(learnerWrite));

  // Lineage rows are reference data too.
  const { error: learnerLink } = await a.learner.client
    .from("objective_lineage")
    .insert({ from_objective_id: c.oldA, to_objective_id: c.newA, method: "manual" });
  check("a learner cannot write objective lineage", Boolean(learnerLink));
  const { error: selfLink } = await admin
    .from("objective_lineage")
    .insert({ from_objective_id: c.newA, to_objective_id: c.newA, method: "manual" });
  check("an objective cannot be linked to itself", Boolean(selfLink));
  const { error: linkError } = await admin.from("objective_lineage").insert([
    { from_objective_id: c.oldA, to_objective_id: c.newA, method: "text-match", confirmed_by: TAG },
    { from_objective_id: c.oldB, to_objective_id: c.newB, method: "manual", confirmed_by: TAG },
  ]);
  check("confirmed links are stored", !linkError, linkError?.message);
  const { error: duplicate } = await admin
    .from("objective_lineage")
    .insert({ from_objective_id: c.oldA, to_objective_id: c.newB, method: "manual" });
  check("one old objective has at most one successor", Boolean(duplicate));

  // Progress on the retired objectives in both households.
  await admin.from("learning_events").insert([event(a.learner.profileId, c.oldA), event(a.learner.profileId, c.oldA)]);
  await admin.from("learning_events").insert(event(b.learner.profileId, c.oldA));
  await admin.from("mistake_notebook").insert({
    student_id: a.learner.profileId,
    objective_id: c.oldA,
    error_category: "ConceptGap",
    question_snapshot: "probe",
    correct_model_answer: "probe",
  });
  await admin.from("fsrs_retention_items").insert([
    { student_id: a.learner.profileId, objective_id: c.oldA },
    // B's successor already has a schedule, so this one must stay put.
    { student_id: a.learner.profileId, objective_id: c.oldB },
    { student_id: a.learner.profileId, objective_id: c.newB },
  ]);

  // Retired objectives are hidden from listings that filter them.
  const { data: listed } = await a.learner.client
    .from("learning_objectives")
    .select("objective_code")
    .eq("topic_id", c.topicId)
    .is("retired_at", null);
  check(
    "listings that skip retired objectives show only the new ones",
    JSON.stringify((listed ?? []).map((row) => row.objective_code).sort()) === JSON.stringify(["PR-9999-1.1.1", "PR-9999-1.1.2"]),
    JSON.stringify(listed),
  );

  const learnerRun = await a.learner.client.rpc("carry_over_objective_progress");
  check("a learner cannot move progress", Boolean(learnerRun.error));

  const moved = await a.guardian.client.rpc("carry_over_objective_progress");
  const counts = (moved.data ?? {}) as Record<string, number>;
  check("the guardian's run succeeds", !moved.error, moved.error?.message);
  check("A's events moved", counts.learning_events === 2, JSON.stringify(counts));
  check("A's notebook entry moved", counts.mistake_notebook === 1, JSON.stringify(counts));
  check("A's schedule moved where the successor had none", counts.fsrs_retention_items === 1, JSON.stringify(counts));
  check("a schedule that would collide is left and reported", counts.schedules_left_on_retired === 1, JSON.stringify(counts));

  const { count: bStill } = await admin
    .from("learning_events")
    .select("id", { count: "exact", head: true })
    .eq("student_id", b.learner.profileId)
    .eq("objective_id", c.oldA);
  check("household B's progress was not touched", bStill === 1, String(bStill));

  const { count: aNew } = await admin
    .from("learning_events")
    .select("id", { count: "exact", head: true })
    .eq("student_id", a.learner.profileId)
    .eq("objective_id", c.newA);
  check("A's history now resolves to the new objective", aNew === 2, String(aNew));

  const again = await a.guardian.client.rpc("carry_over_objective_progress");
  const second = (again.data ?? {}) as Record<string, number>;
  check("running it again moves nothing", !again.error && second.learning_events === 0 && second.mistake_notebook === 0, JSON.stringify(second));

  const bRun = await b.guardian.client.rpc("carry_over_objective_progress");
  check("B's guardian moves only B's row", ((bRun.data ?? {}) as Record<string, number>).learning_events === 1, JSON.stringify(bRun.data));
}

async function cleanup() {
  for (const id of created.households) await admin.from("households").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  for (const id of created.subjects) await admin.from("subjects").delete().eq("id", id);
  const { data: leftovers } = await admin.from("households").select("id").like("name", `${TAG}%`);
  const { data: subjects } = await admin.from("subjects").select("id").like("subject_name", `${TAG}%`);
  console.log(
    `\ncleanup: ${created.households.length} households, ${created.users.length} users, ${created.subjects.length} subject removed; ` +
      `${(leftovers?.length ?? 0) + (subjects?.length ?? 0)} left over`,
  );
  if (leftovers?.length || subjects?.length) process.exitCode = 1;
}

run()
  .catch((error) => check("probe ran to the end", false, (error as Error).message))
  .finally(async () => {
    await cleanup();
    const failed = checks.filter((item) => !item.ok);
    console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  });
