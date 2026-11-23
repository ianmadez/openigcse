/**
 * Phase 4 RLS tightening, at the database layer, with real JWTs.
 *
 *   pnpm verify:phase4
 *
 * Two throwaway households (A and B). Signed in as those people it checks:
 *   - learners cannot read answer keys, and see paper questions only once they start the paper;
 *   - learners can log unscored events but cannot award themselves a score, edit or delete events;
 *   - answer_checkpoint scores on the server and refuses unsat paper questions and guardians;
 *   - mistakes resolve only by a correct retry, or by a correction a guardian approves;
 *   - another household sees none of it.
 *
 * Everything it created is deleted in `finally`. Real households are only read (two objective ids).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnv } from "./lib/env";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TAG = `phase4-probe-${Date.now()}`;
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

const mcq = (householdId: string, objectiveId: string, prompt: string) => ({
  household_id: householdId,
  objective_id: objectiveId,
  question_type: "MCQ",
  prompt_template: prompt,
  options_schema: [
    { letter: "A", text: "one", correct: false },
    { letter: "B", text: "two", correct: true },
  ],
  mark_scheme_rubric: "B, because two",
  max_marks: 1,
});

async function run() {
  const { data: objectives } = await admin.from("learning_objectives").select("id").limit(2);
  if (!objectives || objectives.length < 2) throw new Error("Need two learning objectives to probe with.");
  const objective = objectives[0]!.id as string;

  const a = await household("a");
  const b = await household("b");
  const learner = a.learner.client;

  // ---- guardian A authors a free checkpoint, a paper question and a short answer
  const { data: bank, error: bankError } = await a.guardian.client
    .from("question_templates")
    .insert([
      mcq(a.id, objective, "Free checkpoint"),
      mcq(a.id, objective, "Paper question"),
      { household_id: a.id, objective_id: objective, question_type: "ShortAnswer", prompt_template: "Short", model_answer: "M", mark_scheme_rubric: "R", max_marks: 1 },
    ])
    .select("id, prompt_template");
  check("guardian writes the bank", !bankError && bank?.length === 3, bankError?.message);
  const id = (prompt: string) => bank?.find((row) => row.prompt_template === prompt)?.id as string;

  const { data: paper, error: paperError } = await a.guardian.client
    .from("term_assessments")
    .insert({ academic_term_id: a.termId, student_id: a.learner.profileId, title: `${TAG} paper`, assessment_category: "WeeklyQuiz", total_marks: 1, duration_minutes: 10, status: "Scheduled" })
    .select("id")
    .single();
  check("guardian creates a paper", !paperError, paperError?.message);
  await a.guardian.client.from("assessment_items").insert({ assessment_id: paper?.id, question_template_id: id("Paper question"), sequence: 1, marks_available: 1 });

  // ---- answer keys
  const { data: raw } = await learner.from("question_templates").select("id, options_schema");
  check("learner cannot read question_templates (keys)", (raw ?? []).length === 0, JSON.stringify(raw));

  const { data: safe, error: safeError } = await learner.from("learner_questions").select("id, prompt_template, options_schema");
  const prompts = (safe ?? []).map((row) => row.prompt_template).sort();
  check("learner sees free questions without keys", !safeError && prompts.join() === "Free checkpoint,Short" && !JSON.stringify(safe).includes("correct"), safeError?.message ?? JSON.stringify(safe));

  const { data: guardianSees } = await a.guardian.client.from("question_templates").select("id");
  check("guardian still reads the full bank", guardianSees?.length === 3);

  const { data: bSafe } = await b.learner.client.from("learner_questions").select("id");
  check("other household's learner sees none", (bSafe ?? []).length === 0);

  // ---- events
  const own = { student_id: a.learner.profileId, objective_id: objective, actual_minutes_spent: 5 };
  const { error: lessonError } = await learner.from("learning_events").insert({ ...own, event_type: "Exposure_Lesson", score_ratio: 0 });
  check("learner logs lesson time", !lessonError, lessonError?.message);
  const { error: stuckError } = await learner.from("learning_events").insert({ ...own, event_type: "Application_Question", score_ratio: 0, flagged_stuck: true });
  check("learner flags stuck", !stuckError, stuckError?.message);
  const { error: scoreError } = await learner.from("learning_events").insert({ ...own, event_type: "Active_Recall", score_ratio: 1 });
  check("learner cannot award a score", Boolean(scoreError));
  const { error: otherError } = await learner.from("learning_events").insert({ ...own, student_id: b.learner.profileId, event_type: "Exposure_Lesson", score_ratio: 0 });
  check("learner cannot log for another learner", Boolean(otherError));
  const { data: edited } = await learner.from("learning_events").update({ score_ratio: 1 }).eq("student_id", a.learner.profileId).select("id");
  check("learner cannot edit events", (edited ?? []).length === 0);
  const { data: deleted } = await learner.from("learning_events").delete().eq("student_id", a.learner.profileId).select("id");
  check("learner cannot delete events", (deleted ?? []).length === 0);

  // ---- answer_checkpoint
  const wrong = await learner.rpc("answer_checkpoint", { p_question_id: id("Free checkpoint"), p_option: "A" });
  check("wrong checkpoint answer scores 0", !wrong.error && wrong.data?.[0]?.correct === false && wrong.data?.[0]?.correct_option === "B", wrong.error?.message ?? JSON.stringify(wrong.data));
  const right = await learner.rpc("answer_checkpoint", { p_question_id: id("Free checkpoint"), p_option: "b" });
  check("right checkpoint answer scores 1", right.data?.[0]?.correct === true, right.error?.message);
  const { data: recall } = await admin.from("learning_events").select("score_ratio").eq("student_id", a.learner.profileId).eq("event_type", "Active_Recall");
  check("two Active_Recall events written by the server", recall?.map((row) => Number(row.score_ratio)).sort().join() === "0,1", JSON.stringify(recall));
  const unsat = await learner.rpc("answer_checkpoint", { p_question_id: id("Paper question"), p_option: "B" });
  check("unsat paper question is refused", Boolean(unsat.error));
  const asGuardian = await a.guardian.client.rpc("answer_checkpoint", { p_question_id: id("Free checkpoint"), p_option: "B" });
  check("guardian cannot answer as a learner", Boolean(asGuardian.error));
  const anon = await client().rpc("answer_checkpoint", { p_question_id: id("Free checkpoint"), p_option: "B" });
  check("anonymous caller is refused", Boolean(anon.error));

  // ---- mistakes
  const { error: addError } = await learner.from("mistake_notebook").insert({ student_id: a.learner.profileId, objective_id: objective, error_category: "ConceptGap", question_snapshot: "own note", correct_model_answer: "", source: "student" });
  check("learner adds to their notebook", !addError, addError?.message);
  const { error: fakeMarking } = await learner.from("mistake_notebook").insert({ student_id: a.learner.profileId, objective_id: objective, error_category: "ConceptGap", question_snapshot: "x", correct_model_answer: "", source: "marking" });
  check("learner cannot forge a marking mistake", Boolean(fakeMarking));

  const { data: seeded } = await admin
    .from("mistake_notebook")
    .insert([
      { student_id: a.learner.profileId, objective_id: objective, error_category: "ConceptGap", question_snapshot: "mcq", correct_model_answer: "B", question_template_id: id("Free checkpoint"), source: "marking" },
      { student_id: a.learner.profileId, objective_id: objective, error_category: "ConceptGap", question_snapshot: "short", correct_model_answer: "M", question_template_id: id("Short"), source: "marking" },
    ])
    .select("id, question_snapshot");
  const mistake = (note: string) => seeded?.find((row) => row.question_snapshot === note)?.id as string;

  const { data: direct } = await learner.from("mistake_notebook").update({ resolved: true }).eq("id", mistake("mcq")).select("id");
  check("learner cannot resolve directly", (direct ?? []).length === 0);
  const noAnswer = await learner.rpc("resolve_mistake", { p_mistake_id: mistake("mcq") });
  check("resolve without a retry is refused", Boolean(noAnswer.error));
  const badRetry = await learner.rpc("resolve_mistake", { p_mistake_id: mistake("mcq"), p_option: "A" });
  check("wrong retry leaves it open", badRetry.data?.[0]?.resolved === false, badRetry.error?.message);
  const goodRetry = await learner.rpc("resolve_mistake", { p_mistake_id: mistake("mcq"), p_option: "B" });
  check("correct retry resolves it", goodRetry.data?.[0]?.resolved === true, goodRetry.error?.message);
  const { data: corrections } = await admin.from("learning_events").select("score_ratio").eq("student_id", a.learner.profileId).eq("event_type", "Error_Correction");
  check("both retries logged as Error_Correction", corrections?.length === 2, JSON.stringify(corrections));

  const written = await learner.rpc("resolve_mistake", { p_mistake_id: mistake("short"), p_correction: "The answer is M" });
  check("no-MCQ mistake waits for a parent", written.data?.[0]?.awaiting_parent === true && written.data?.[0]?.resolved === false, written.error?.message);
  const { data: approved } = await a.guardian.client.from("mistake_notebook").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", mistake("short")).select("resolved");
  check("guardian approves the correction", approved?.[0]?.resolved === true);

  const { data: bEvents } = await b.guardian.client.from("learning_events").select("id").eq("student_id", a.learner.profileId);
  const { data: bNotebook } = await b.guardian.client.from("mistake_notebook").select("id").eq("student_id", a.learner.profileId);
  check("other household sees no events or mistakes", (bEvents ?? []).length === 0 && (bNotebook ?? []).length === 0);
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
