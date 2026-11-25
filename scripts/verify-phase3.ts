/**
 * Phase 3 exit gate, at the database layer, with real JWTs.
 *
 *   pnpm verify:phase3
 *
 * Creates two throwaway households (A and B) with a guardian and a learner
 * each, then, signed in as those people:
 *   - guardian A writes three questions and a quiz;
 *   - guardian B cannot read or touch A's bank or quiz;
 *   - learner A sits the quiz (the server owns the clock), answers, submits,
 *     and cannot write marks, change the quiz or approve their own evidence;
 *   - guardian A marks one question down through save_assessment_marks, and a
 *     re-save does not duplicate the mistake or the events;
 *   - learner A sees the mistake and resolves it.
 *
 * Everything it created is deleted in `finally`, whatever happened. Real
 * households are only ever read (one learning objective id, as reference).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnv } from "./lib/env";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TAG = `phase3-probe-${Date.now()}`;
const PASSWORD = `${randomUUID()}Aa1!`;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` - ${detail}` : ""}`);
}

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const created = { households: [] as string[], users: [] as string[], files: [] as string[] };

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

async function run() {
  const { data: objectives } = await admin.from("learning_objectives").select("id").limit(2);
  if (!objectives || objectives.length < 2) throw new Error("Need two learning objectives in the project to probe with.");
  const objectiveOne = objectives[0]!.id as string;
  const objectiveTwo = objectives[1]!.id as string;

  const a = await household("a");
  const b = await household("b");

  // ---- guardian A authors
  const questions = [
    {
      household_id: a.id,
      objective_id: objectiveOne,
      question_type: "MCQ",
      prompt_template: "Probe MCQ",
      options_schema: [
        { letter: "A", text: "one", correct: true },
        { letter: "B", text: "two", correct: false },
      ],
      mark_scheme_rubric: "A",
      max_marks: 1,
    },
    {
      household_id: a.id,
      objective_id: objectiveOne,
      question_type: "ShortAnswer",
      prompt_template: "Probe short answer",
      model_answer: "Probe model",
      mark_scheme_rubric: "One mark for the model",
      max_marks: 1,
    },
    {
      household_id: a.id,
      objective_id: objectiveTwo,
      question_type: "Structured",
      prompt_template: "Probe structured",
      parts: [
        { label: "a", prompt: "first", marks: 1 },
        { label: "b", prompt: "second", marks: 1 },
      ],
      mark_scheme_rubric: "One mark per part",
      max_marks: 2,
    },
  ];

  const { data: bank, error: bankError } = await a.guardian.client.from("question_templates").insert(questions, { defaultToNull: false }).select("id, max_marks");
  check("guardian writes three questions", !bankError && bank?.length === 3, bankError?.message);
  if (!bank) return;
  const [mcq, short, structured] = bank as Array<{ id: string; max_marks: number }>;
  if (!mcq || !short || !structured) return;

  const { data: quiz, error: quizError } = await a.guardian.client
    .from("term_assessments")
    .insert({
      academic_term_id: a.termId,
      student_id: a.learner.profileId,
      assessment_category: "WeeklyQuiz",
      title: "Probe quiz",
      duration_minutes: 20,
      total_marks: 4,
      status: "Scheduled",
    })
    .select("id")
    .single();
  check("guardian creates the quiz", !quizError && Boolean(quiz), quizError?.message);
  if (!quiz) return;

  const { error: itemsError } = await a.guardian.client.from("assessment_items").insert(
    bank.map((question, index) => ({
      assessment_id: quiz.id,
      question_template_id: question.id,
      sequence: index,
      marks_available: question.max_marks,
    })),
  );
  check("guardian adds the questions to the quiz", !itemsError, itemsError?.message);

  // ---- guardian B is kept out
  const { data: bSeesBank } = await b.guardian.client.from("question_templates").select("id").eq("household_id", a.id);
  check("other household cannot read the bank", (bSeesBank ?? []).length === 0, `${bSeesBank?.length ?? 0} visible`);

  const { error: bWritesBank } = await b.guardian.client
    .from("question_templates")
    .insert({ ...questions[0], household_id: a.id });
  check("other household cannot write into the bank", Boolean(bWritesBank), bWritesBank?.code ?? "accepted");

  const { data: bQuestion } = await b.guardian.client
    .from("question_templates")
    .insert({ ...questions[0], household_id: b.id })
    .select("id")
    .single();
  const { error: bWritesItem } = await b.guardian.client
    .from("assessment_items")
    .insert({ assessment_id: quiz.id, question_template_id: bQuestion?.id, sequence: 9, marks_available: 1 });
  check("other household cannot add items to the quiz", Boolean(bWritesItem), bWritesItem?.code ?? "accepted");

  const { error: bMarks } = await b.guardian.client.rpc("save_assessment_marks", {
    p_assessment_id: quiz.id,
    p_student_id: a.learner.profileId,
    p_marks: [],
  });
  check("other household cannot mark the quiz", Boolean(bMarks), bMarks?.message ?? "accepted");

  // ---- learner A sits it
  const learner = a.learner.client;

  const { data: sitting, error: sittingError } = await learner
    .from("assessment_sittings")
    .insert({ household_id: a.id, student_id: a.learner.profileId, assessment_id: quiz.id, started_at: "2000-01-01T00:00:00Z" })
    .select("id, started_at")
    .single();
  check("learner starts a sitting", !sittingError && Boolean(sitting), sittingError?.message);
  check(
    "server owns the start time",
    Boolean(sitting) && Date.now() - new Date(sitting!.started_at).getTime() < 60_000,
    sitting?.started_at,
  );

  const { error: duplicateSitting } = await learner
    .from("assessment_sittings")
    .insert({ household_id: a.id, student_id: a.learner.profileId, assessment_id: quiz.id });
  check("a second sitting for the same quiz is refused", Boolean(duplicateSitting), duplicateSitting?.code ?? "accepted");

  const { error: answerError } = await learner.from("assessment_responses").upsert(
    [
      { question_template_id: mcq.id, selected_option: "A" },
      { question_template_id: short.id, answer_text: "Probe model" },
      { question_template_id: structured.id, answer_text: "a) first b) wrong" },
    ].map((row) => ({ ...row, household_id: a.id, student_id: a.learner.profileId, assessment_id: quiz.id })),
    { onConflict: "assessment_id,student_id,question_template_id" },
  );
  check("learner autosaves answers", !answerError, answerError?.message);

  const { error: learnerMarks } = await learner
    .from("assessment_item_marks")
    .insert({ assessment_id: quiz.id, question_template_id: mcq.id, marks_awarded: 1 });
  check("learner cannot write marks", Boolean(learnerMarks), learnerMarks?.code ?? "accepted");

  const { error: learnerRpc } = await learner.rpc("save_assessment_marks", {
    p_assessment_id: quiz.id,
    p_student_id: a.learner.profileId,
    p_marks: [],
  });
  check("learner cannot call the marking function", Boolean(learnerRpc), learnerRpc?.message ?? "accepted");

  const { data: quizEdit } = await learner
    .from("term_assessments")
    .update({ status: "Marked", student_score: 100 })
    .eq("id", quiz.id)
    .select("id");
  check("learner cannot change the quiz", (quizEdit ?? []).length === 0, `${quizEdit?.length ?? 0} updated`);

  const { error: earlyMarks } = await a.guardian.client.rpc("save_assessment_marks", {
    p_assessment_id: quiz.id,
    p_student_id: a.learner.profileId,
    p_marks: bank.map((question) => ({ questionId: question.id, awarded: question.max_marks })),
  });
  check("marking waits until the sitting is handed in", Boolean(earlyMarks), earlyMarks?.message ?? "accepted");

  const { data: submitted } = await learner
    .from("assessment_sittings")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", sitting!.id)
    .select("submitted_at");
  check("learner hands in", Boolean(submitted?.[0]?.submitted_at));

  const { data: lateEdit } = await learner
    .from("assessment_responses")
    .update({ answer_text: "changed after submitting" })
    .eq("assessment_id", quiz.id)
    .select("id");
  check("answers are frozen after handing in", (lateEdit ?? []).length === 0, `${lateEdit?.length ?? 0} updated`);

  const { data: reopened } = await learner
    .from("assessment_sittings")
    .update({ submitted_at: null })
    .eq("id", sitting!.id)
    .select("id");
  check("learner cannot reopen a handed-in sitting", (reopened ?? []).length === 0);

  // ---- evidence: a learner cannot approve their own work
  const { data: evidence, error: evidenceError } = await learner
    .from("evidence_portfolio")
    .insert({
      household_id: a.id,
      student_id: a.learner.profileId,
      title: "Probe evidence",
      typed_response: "probe",
      evaluation_status: "Approved",
    })
    .select("id, evaluation_status")
    .single();
  check(
    "learner evidence always starts as Submitted",
    !evidenceError && evidence?.evaluation_status === "Submitted",
    evidenceError?.message ?? evidence?.evaluation_status,
  );

  const { data: guardianReview } = await a.guardian.client
    .from("evidence_portfolio")
    .update({ evaluation_status: "Approved", parent_feedback: "Good" })
    .eq("id", evidence?.id ?? randomUUID())
    .select("evaluation_status, reviewed_at");
  check(
    "guardian approves evidence",
    guardianReview?.[0]?.evaluation_status === "Approved" && Boolean(guardianReview?.[0]?.reviewed_at),
  );

  // ---- storage: own household folder only
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );
  const ownPath = `${a.id}/working/${a.learner.profileId}/${randomUUID()}.png`;
  const { error: ownUpload } = await learner.storage
    .from("household-files")
    .upload(ownPath, png, { contentType: "image/png" });
  if (!ownUpload) created.files.push(ownPath);
  check("learner uploads working into their folder", !ownUpload, ownUpload?.message);

  const foreignPath = `${b.id}/working/${a.learner.profileId}/${randomUUID()}.png`;
  const { error: foreignUpload } = await learner.storage
    .from("household-files")
    .upload(foreignPath, png, { contentType: "image/png" });
  if (!foreignUpload) created.files.push(foreignPath);
  check("learner cannot upload into another household", Boolean(foreignUpload), foreignUpload?.message ?? "accepted");

  const { data: bReadsFile } = await b.guardian.client.storage.from("household-files").download(ownPath);
  check("other household cannot read the file", !bReadsFile);

  // ---- guardian A marks
  const marks = (structuredMark: Record<string, unknown>) => [
    { questionId: mcq.id, awarded: 1 },
    { questionId: short.id, awarded: 1 },
    { questionId: structured.id, ...structuredMark },
  ];

  const { error: noReason } = await a.guardian.client.rpc("save_assessment_marks", {
    p_assessment_id: quiz.id,
    p_student_id: a.learner.profileId,
    p_marks: marks({ awarded: 1 }),
  });
  check("a dropped mark without a reason is refused", Boolean(noReason), noReason?.message ?? "accepted");

  const { error: overMax } = await a.guardian.client.rpc("save_assessment_marks", {
    p_assessment_id: quiz.id,
    p_student_id: a.learner.profileId,
    p_marks: marks({ awarded: 3 }),
  });
  check("a mark above the maximum is refused", Boolean(overMax), overMax?.message ?? "accepted");

  const { data: refusedLeftovers } = await admin.from("assessment_item_marks").select("id").eq("assessment_id", quiz.id);
  check("a refused save writes nothing", (refusedLeftovers ?? []).length === 0, `${refusedLeftovers?.length} marks`);

  for (const attempt of ["first save", "re-save"]) {
    const { data: result, error } = await a.guardian.client.rpc("save_assessment_marks", {
      p_assessment_id: quiz.id,
      p_student_id: a.learner.profileId,
      p_marks: marks({ awarded: 1, errorCategory: "IncompleteExplanation", feedback: "Part b needs the reason" }),
      p_feedback: "Good start",
    });
    check(`guardian saves marks (${attempt})`, !error && result?.awarded === 3 && result?.available === 4, error?.message ?? JSON.stringify(result));
  }

  const [{ data: mistakes }, { data: events }, { data: marked }] = await Promise.all([
    admin.from("mistake_notebook").select("id, error_category, question_template_id, source").eq("term_assessment_id", quiz.id),
    admin.from("learning_events").select("objective_id, score_ratio").eq("term_assessment_id", quiz.id),
    admin.from("term_assessments").select("status, student_score").eq("id", quiz.id).single(),
  ]);
  check("exactly one mistake after a re-save", mistakes?.length === 1 && mistakes[0]?.question_template_id === structured.id, JSON.stringify(mistakes));
  const ratios = new Map((events ?? []).map((event) => [event.objective_id, Number(event.score_ratio)]));
  check(
    "one Formal_Assessment event per objective with its ratio",
    events?.length === 2 && ratios.get(objectiveOne) === 1 && ratios.get(objectiveTwo) === 0.5,
    JSON.stringify(events),
  );
  check("quiz is Marked at 75%", marked?.status === "Marked" && Number(marked?.student_score) === 75, JSON.stringify(marked));

  // ---- learner A reviews and resolves
  const { data: notebook } = await learner.from("mistake_notebook").select("id, resolved").eq("student_id", a.learner.profileId);
  check("mistake appears in the learner's notebook", notebook?.length === 1 && notebook[0]?.resolved === false);

  // Phase 4: a structured-question mistake resolves by a written correction the guardian approves.
  const mistakeId = notebook?.[0]?.id ?? randomUUID();
  const correction = await learner.rpc("resolve_mistake", { p_mistake_id: mistakeId, p_correction: "Probe correction" });
  const { data: resolved } = await a.guardian.client
    .from("mistake_notebook")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", mistakeId)
    .select("resolved");
  check(
    "learner submits a correction and the guardian resolves it",
    correction.data?.[0]?.awaiting_parent === true && resolved?.[0]?.resolved === true,
    correction.error?.message,
  );

  const { data: bNotebook } = await b.guardian.client.from("mistake_notebook").select("id").eq("student_id", a.learner.profileId);
  check("other household cannot see the notebook", (bNotebook ?? []).length === 0);
}

async function cleanup() {
  if (created.files.length) await admin.storage.from("household-files").remove(created.files);
  // Households cascade to profiles, terms, questions, quizzes, sittings,
  // answers, marks, mistakes, events and evidence.
  for (const id of created.households) await admin.from("households").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);

  const { data: leftovers } = await admin.from("households").select("id").like("name", `${TAG}%`);
  console.log(`\ncleanup: ${created.households.length} households, ${created.users.length} users, ${created.files.length} files removed; ${leftovers?.length ?? 0} left over`);
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
