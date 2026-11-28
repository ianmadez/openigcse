import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnv } from "./lib/env";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TAG = `phase8-probe-${Date.now()}`;
const PASSWORD = `${randomUUID()}Aa1!`;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail && !ok ? ` - ${detail}` : ""}`);
}

const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const created = { households: [] as string[], users: [] as string[] };

type Person = { client: SupabaseClient; profileId: string };
type Household = { id: string; termId: string; guardian: Person; learner: Person };

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
  const { data: term, error: termError } = await admin
    .from("academic_terms")
    .insert({ household_id: data.id, name: "Probe term", start_date: "2026-09-01", end_date: "2026-12-05", status: "active" })
    .select("id")
    .single();
  if (termError) throw new Error(`term ${label}: ${termError.message}`);
  return {
    id: data.id,
    termId: term.id,
    guardian: await person(data.id, "parent_educator", `${label}-guardian`),
    learner: await person(data.id, "student", `${label}-learner`),
  };
}


async function auditFor(who: Person, action: string) {
  const { data } = await who.client.from("audit_log").select("action, actor_profile_id, target_id, detail").eq("action", action);
  return data ?? [];
}

async function run() {
  // ============================================================ rate limits
  const anon = client();
  const key = `${TAG}-key`;
  const hits: number[] = [];
  for (let i = 0; i < 6; i++) {
    const { data, error } = await anon.rpc("hit_rate_limit", { p_bucket: "pairing", p_key: key, p_max: 5, p_window_seconds: 900 });
    if (error) throw new Error(`hit_rate_limit: ${error.message}`);
    hits.push(Number(data));
  }
  check("five pairing attempts are allowed", hits.slice(0, 5).every((wait) => wait === 0), JSON.stringify(hits));
  check("the sixth is refused with a wait", hits[5]! > 0 && hits[5]! <= 900, JSON.stringify(hits));
  const other = await anon.rpc("hit_rate_limit", { p_bucket: "pairing", p_key: `${key}-other`, p_max: 5, p_window_seconds: 900 });
  check("a different key is not affected", other.data === 0, JSON.stringify(other));
  const peek = await anon.from("auth_rate_limits").select("id").limit(1);
  check("anon cannot read the limiter table", (peek.data ?? []).length === 0);
  await admin.from("auth_rate_limits").delete().like("key_hash", `${TAG}%`);

  // ============================================================ audit log
  const a = await household("a");
  const b = await household("b");
  const { data: brk } = await a.learner.client
    .from("requests").insert({ household_id: a.id, student_id: a.learner.profileId, request_type: "break" }).select("id").single();
  const decided = await a.guardian.client.rpc("decide_request", { p_request_id: brk!.id, p_decision: "10", p_note: null });
  check("guardian approves a break", !decided.error, decided.error?.message);
  const approvals = await auditFor(a.guardian, "request.approved");
  check("the approval is in the audit log", approvals.some((row) => row.target_id === brk!.id), JSON.stringify(approvals));
  check("the approval names the guardian", approvals[0]?.actor_profile_id === a.guardian.profileId, JSON.stringify(approvals));

  await admin.from("pin_attempt_logs").insert({ household_id: a.id, actor_profile_id: a.guardian.profileId, succeeded: true });
  check("a PIN unlock is audited", (await auditFor(a.guardian, "parent.unlock")).length === 1);

  const { data: assessment, error: assessmentError } = await admin
    .from("term_assessments").insert({ student_id: a.learner.profileId, title: `${TAG} quiz`, status: "Draft", assessment_category: "WeeklyQuiz", total_marks: 5 })
    .select("id").single();
  if (assessmentError) throw new Error(`assessment: ${assessmentError.message}`);
  const { data: template, error: templateError } = await admin
    .from("question_templates")
    .insert({ household_id: a.id, question_type: "ShortAnswer", prompt_template: `${TAG} prompt`, mark_scheme_rubric: "1 mark" })
    .select("id").single();
  if (templateError) throw new Error(`template: ${templateError.message}`);
  const { data: mark, error: markError } = await admin
    .from("assessment_item_marks")
    .insert({ assessment_id: assessment.id, question_template_id: template.id, marks_awarded: 2, marked_by: a.guardian.profileId })
    .select("id").single();
  if (markError) throw new Error(`mark: ${markError.message}`);
  await admin.from("assessment_item_marks").update({ marks_awarded: 3 }).eq("id", mark!.id);
  check("the first mark is audited", (await auditFor(a.guardian, "mark.set")).length === 1);
  const changed = await auditFor(a.guardian, "mark.changed");
  check("a mark change records from and to", changed.length === 1 && changed[0]!.detail.from === 2 && changed[0]!.detail.to === 3, JSON.stringify(changed));

  check("the learner cannot read the audit log", (await a.learner.client.from("audit_log").select("id")).data?.length === 0);
  check("another household cannot read it", (await b.guardian.client.from("audit_log").select("id")).data?.length === 0);
  const forged = await a.guardian.client.from("audit_log").insert({ household_id: b.id, actor_profile_id: a.guardian.profileId, action: "forged" });
  check("a guardian cannot write into another household's log", Boolean(forged.error));
  const erase = await a.guardian.client.from("audit_log").delete().eq("household_id", a.id).select("id");
  check("the log cannot be erased through the API", (erase.data ?? []).length === 0);
}
async function cleanup() {
  for (const id of created.households) await admin.from("households").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  const { data: leftovers } = await admin.from("households").select("id").like("name", `${TAG}%`);
  console.log(`\ncleanup: ${created.households.length} households, ${created.users.length} users removed; ${leftovers?.length ?? 0} left over`);
  if (leftovers?.length) process.exitCode = 1;
}

run()
  .catch((error) => check("probe ran to the end", false, (error as Error).message))
  .finally(async () => {
    await cleanup();
    const failed = checks.filter((item) => !item.ok);
    console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
    if (failed.length) process.exitCode = 1;
  });
