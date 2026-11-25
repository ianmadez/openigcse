/**
 * Phase 4 RLS tightening, at the database layer, with real JWTs.
 *
 *   pnpm verify:phase4
 *
 * Two throwaway households (A and B). Signed in as those people it checks:
 *   - learners cannot read answer keys, and see paper questions only once they start the paper;
 *   - learners can log unscored events but cannot award themselves a score, edit or delete events;
 *   - answer_checkpoint scores on the server and refuses unsat paper questions and guardians;
 *   - a practice checkpoint writes Application_Question, a documentary checkpoint writes
 *     Active_Recall, and the learner only ever sees trivia questions without their keys;
 *   - a checkpoint can be added to the notebook by the learner and recategorised by a guardian;
 *   - FSRS: scored events fold into one card, an event is applied once, trivia (no objective) is
 *     skipped, and neither the card nor the review log can be written directly;
 *   - mastery is computed on read and matches the TypeScript twin, and only the owning household
 *     can read it;
 *   - mistakes resolve only by a correct retry, or by a correction a guardian approves;
 *   - another household sees none of it.
 *
 * Everything it created is deleted in `finally`. Real households are only read (two objective ids).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { rankActivities, type ActivitySignal } from "../src/lib/planning/nextBestActivity";
import { nextCard, ratingFor, type RetentionCard } from "../src/lib/retention/fsrs";
import { objectiveMasteryOf, retrievabilityOf } from "../src/lib/retention/mastery";
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
  const gateObjective = objectives[1]!.id as string;

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

  // ---- Step 4.1: the learner runs their day
  const { data: items, error: itemsError } = await admin
    .from("day_plan_items")
    .insert([
      { household_id: a.id, student_id: a.learner.profileId, plan_date: "2026-11-24", sequence: 1, item_type: "lesson", learning_objective_id: objective, title: "Probe lesson one", planned_minutes: 20 },
      { household_id: a.id, student_id: a.learner.profileId, plan_date: "2026-11-24", sequence: 2, item_type: "lesson", learning_objective_id: objective, title: "Probe lesson two", planned_minutes: 20 },
    ])
    .select("id, title");
  check("plan items seeded", !itemsError && items?.length === 2, itemsError?.message);
  const item = (title: string) => items?.find((row) => row.title === title)?.id as string;

  const { error: replan } = await learner.from("day_plan_items").update({ planned_minutes: 5 }).eq("id", item("Probe lesson one"));
  check("learner cannot change what is planned", Boolean(replan));
  const { error: fakeDone } = await learner.from("day_plan_items").update({ status: "done" }).eq("id", item("Probe lesson one"));
  check("learner cannot mark done without Finish", Boolean(fakeDone));
  const { error: bareSkip } = await learner.from("day_plan_items").update({ status: "skipped" }).eq("id", item("Probe lesson two"));
  check("skip needs a reason", Boolean(bareSkip));
  const { error: skipError } = await learner.from("day_plan_items").update({ status: "skipped", skip_reason: "too-hard" }).eq("id", item("Probe lesson two"));
  check("learner skips with a reason", !skipError, skipError?.message);
  const { error: reorderError } = await learner.from("day_plan_items").update({ sequence: 5, student_reordered: true }).eq("id", item("Probe lesson one"));
  check("learner reorders", !reorderError, reorderError?.message);

  const bFinish = await b.learner.client.rpc("finish_plan_item", { p_item_id: item("Probe lesson one"), p_minutes: 10 });
  check("other learner cannot finish it", Boolean(bFinish.error));
  const finish = await learner.rpc("finish_plan_item", { p_item_id: item("Probe lesson one"), p_minutes: 18 });
  const again = await learner.rpc("finish_plan_item", { p_item_id: item("Probe lesson one"), p_minutes: 18 });
  check("finish succeeds once, then is a no-op", finish.data === true && again.data === false, finish.error?.message ?? again.error?.message);
  const { data: lessonEvents } = await admin
    .from("learning_events")
    .select("actual_minutes_spent")
    .eq("student_id", a.learner.profileId)
    .eq("event_type", "Exposure_Lesson")
    .eq("actual_minutes_spent", 18);
  const { data: finished } = await admin.from("day_plan_items").select("status, actual_minutes").eq("id", item("Probe lesson one")).single();
  check("finish writes one Exposure_Lesson and sets Done", lessonEvents?.length === 1 && finished?.status === "done" && finished.actual_minutes === 18, JSON.stringify({ lessonEvents, finished }));
  const { error: undo } = await learner.from("day_plan_items").update({ status: "planned" }).eq("id", item("Probe lesson one"));
  check("a finished item stays finished", Boolean(undo));

  // ---- Step 4.2: checkpoints write the right event, trivia is key-free, the notebook takes a checkpoint
  const practice = await learner.rpc("answer_checkpoint", { p_question_id: id("Free checkpoint"), p_option: "B", p_kind: "practice" });
  const { data: practiceEvents } = await admin
    .from("learning_events")
    .select("score_ratio")
    .eq("student_id", a.learner.profileId)
    .eq("event_type", "Application_Question")
    .eq("flagged_stuck", false);
  check(
    "a practice checkpoint writes Application_Question",
    !practice.error && practiceEvents?.length === 1 && Number(practiceEvents[0]?.score_ratio) === 1,
    practice.error?.message ?? JSON.stringify(practiceEvents),
  );

  const { data: triviaModule, error: triviaModuleError } = await a.guardian.client
    .from("trivia_modules")
    .insert({
      household_id: a.id,
      title: `${TAG} ocean`,
      topic_area: "Oceanography",
      provider: "Probe",
      youtube_video_id: "dQw4w9WgXcQ",
      description: "",
      duration_minutes: 5,
      is_published: true,
    })
    .select("id")
    .single();
  check("guardian authors a trivia module", !triviaModuleError, triviaModuleError?.message);

  const { data: triviaQuestions, error: triviaQuestionsError } = await a.guardian.client
    .from("trivia_questions")
    .insert([
      {
        household_id: a.id,
        module_id: triviaModule?.id,
        at_seconds: 60,
        prompt: "Probe trivia checkpoint",
        options: [
          { letter: "A", text: "one" },
          { letter: "B", text: "two" },
        ],
        correct_letter: "B",
        explanation: "Because two.",
      },
      {
        household_id: a.id,
        module_id: triviaModule?.id,
        at_seconds: 120,
        prompt: "Probe trivia checkpoint two",
        options: [
          { letter: "A", text: "three" },
          { letter: "B", text: "four" },
        ],
        correct_letter: "A",
        explanation: "",
      },
    ])
    .select("id, prompt");
  check("guardian adds timestamped checkpoints", !triviaQuestionsError && triviaQuestions?.length === 2, triviaQuestionsError?.message);
  const triviaQuestion = triviaQuestions?.find((row) => row.prompt === "Probe trivia checkpoint")?.id as string;

  const { data: safeTrivia, error: safeTriviaError } = await learner.from("learner_trivia_questions").select("id, prompt, options");
  const safeJson = JSON.stringify(safeTrivia ?? []);
  check(
    "learner reads trivia checkpoints without keys or answers",
    !safeTriviaError && (safeTrivia ?? []).length === 2 && !safeJson.includes("correct_letter") && !safeJson.includes("explanation"),
    safeTriviaError?.message ?? safeJson,
  );
  const { data: rawTrivia } = await learner.from("trivia_questions").select("id");
  check("learner cannot read trivia_questions (keys)", (rawTrivia ?? []).length === 0, JSON.stringify(rawTrivia));
  const { data: bTrivia } = await b.learner.client.from("learner_trivia_questions").select("id");
  check("other household sees no trivia", (bTrivia ?? []).length === 0);

  const wrongTrivia = await learner.rpc("answer_trivia_checkpoint", { p_question_id: triviaQuestion, p_option: "A" });
  const rightTrivia = await learner.rpc("answer_trivia_checkpoint", { p_question_id: triviaQuestion, p_option: "b" });
  check(
    "trivia answers are scored on the server",
    !wrongTrivia.error &&
      wrongTrivia.data?.[0]?.correct === false &&
      wrongTrivia.data?.[0]?.correct_option === "B" &&
      rightTrivia.data?.[0]?.correct === true,
    wrongTrivia.error?.message ?? rightTrivia.error?.message ?? JSON.stringify([wrongTrivia.data, rightTrivia.data]),
  );
  const { data: triviaEvents } = await admin
    .from("learning_events")
    .select("score_ratio, objective_id")
    .eq("student_id", a.learner.profileId)
    .eq("event_type", "Active_Recall")
    .is("objective_id", null);
  check(
    "trivia answers write Active_Recall with a score and no objective",
    triviaEvents?.map((row) => Number(row.score_ratio)).sort().join() === "0,1" && triviaEvents.every((row) => row.objective_id === null),
    JSON.stringify(triviaEvents),
  );
  const guardianTrivia = await a.guardian.client.rpc("answer_trivia_checkpoint", { p_question_id: triviaQuestion, p_option: "B" });
  check("guardian cannot answer a trivia checkpoint as the learner", Boolean(guardianTrivia.error));
  const anonTrivia = await client().rpc("answer_trivia_checkpoint", { p_question_id: triviaQuestion, p_option: "B" });
  check("anonymous trivia caller is refused", Boolean(anonTrivia.error));

  const { error: crossWrite } = await b.guardian.client
    .from("trivia_modules")
    .insert({
      household_id: a.id,
      title: `${TAG} intruder`,
      topic_area: "Other",
      youtube_video_id: "dQw4w9WgXcQ",
      is_published: true,
    });
  check("another household cannot author into it", Boolean(crossWrite));

  await a.guardian.client.from("trivia_modules").update({ is_published: false }).eq("id", triviaModule?.id);
  const { data: hiddenTrivia } = await learner.from("learner_trivia_questions").select("id");
  const hiddenAnswer = await learner.rpc("answer_trivia_checkpoint", { p_question_id: triviaQuestion, p_option: "B" });
  check(
    "an unpublished module is hidden and refuses answers",
    (hiddenTrivia ?? []).length === 0 && Boolean(hiddenAnswer.error),
    hiddenAnswer.error?.message,
  );

  const { data: notebookEntry, error: notebookError } = await learner
    .from("mistake_notebook")
    .insert({
      student_id: a.learner.profileId,
      objective_id: objective,
      question_template_id: id("Free checkpoint"),
      error_category: "CalculationSlip",
      question_snapshot: "Added from a checkpoint - you chose A: one",
      student_wrong_answer: "one",
      correct_model_answer: "",
      source: "student",
    })
    .select("id")
    .single();
  check("learner adds a checkpoint to the notebook", !notebookError, notebookError?.message);

  const { data: recategorised, error: recategoriseError } = await a.guardian.client
    .from("mistake_notebook")
    .update({ error_category: "CommandWordMisread" })
    .eq("id", notebookEntry?.id)
    .select("error_category");
  check(
    "a guardian recategorises it",
    !recategoriseError && recategorised?.[0]?.error_category === "CommandWordMisread",
    recategoriseError?.message ?? JSON.stringify(recategorised),
  );

  // ---- Step 4.3: FSRS scheduling, applied once per event
  const cardPayload = (card: ReturnType<typeof nextCard>) => ({
    stability: card.stability,
    difficulty: card.difficulty,
    dueAt: card.dueAt,
    retrievability: card.retrievability,
    status: card.status,
    state: card.state,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
  });
  const storedCard = (row: {
    stability: number;
    difficulty: number;
    due_at: string | null;
    last_reviewed_at: string | null;
    reps: number | null;
    lapses: number | null;
    scheduled_days: number | null;
    learning_steps: number | null;
    fsrs_state: number | null;
  }): RetentionCard => ({
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    dueAt: row.due_at ?? new Date(0).toISOString(),
    lastReviewedAt: row.last_reviewed_at,
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    scheduledDays: row.scheduled_days ?? 0,
    learningSteps: row.learning_steps ?? 0,
    state: row.fsrs_state ?? 0,
  });

  const { data: pending, error: pendingError } = await learner.rpc("pending_review_events", {
    p_student: a.learner.profileId,
    p_limit: 100,
  });
  const pendingList = (pending ?? []) as Array<{ event_id: string; objective_id: string; score_ratio: number; event_at: string }>;
  const firstEvent = pendingList.find((event) => event.objective_id === objective);
  check("scored events wait to be folded", !pendingError && Boolean(firstEvent), pendingError?.message ?? JSON.stringify(pendingList.length));

  const firstCard = nextCard(null, { scoreRatio: Number(firstEvent!.score_ratio), at: new Date(firstEvent!.event_at) });
  const firstReview = await learner.rpc("record_review", {
    p_event_id: firstEvent!.event_id,
    p_rating: ratingFor(Number(firstEvent!.score_ratio)),
    p_card: cardPayload(firstCard),
  });
  check("a learner records a review on their own event", firstReview.data?.[0]?.applied === true, firstReview.error?.message);

  const repeated = await learner.rpc("record_review", {
    p_event_id: firstEvent!.event_id,
    p_rating: ratingFor(Number(firstEvent!.score_ratio)),
    p_card: cardPayload(firstCard),
  });
  check("the same event cannot advance the card twice", repeated.data?.[0]?.applied === false, repeated.error?.message);

  const { data: cardRow } = await admin
    .from("fsrs_retention_items")
    .select("stability, difficulty, due_at, last_reviewed_at, reps, lapses, scheduled_days, learning_steps, fsrs_state, status")
    .eq("student_id", a.learner.profileId)
    .eq("objective_id", objective)
    .maybeSingle();
  check(
    "the card is stored once with the scheduled due date",
    Boolean(cardRow) &&
      cardRow!.reps === 1 &&
      new Date(cardRow!.due_at).getTime() === new Date(firstCard.dueAt).getTime() &&
      Number(cardRow!.stability) === firstCard.stability,
    JSON.stringify(cardRow),
  );
  const { data: logRows } = await admin
    .from("fsrs_review_log")
    .select("event_id, rating")
    .eq("event_id", firstEvent!.event_id);
  check(
    "one review row per event",
    logRows?.length === 1 && Number(logRows[0]?.rating) === ratingFor(Number(firstEvent!.score_ratio)),
    JSON.stringify(logRows),
  );

  const otherEvent = pendingList.find((event) => event.event_id !== firstEvent!.event_id && event.objective_id);
  const otherCard = otherEvent
    ? nextCard(storedCard(cardRow!), { scoreRatio: Number(otherEvent.score_ratio), at: new Date(otherEvent.event_at) })
    : null;
  const foreign = otherEvent
    ? await b.learner.client.rpc("record_review", {
        p_event_id: otherEvent.event_id,
        p_rating: ratingFor(Number(otherEvent.score_ratio)),
        p_card: cardPayload(otherCard!),
      })
    : { data: null, error: { message: "no second event" } };
  check("another learner cannot record it", Boolean(foreign.error));

  const guardianFold = otherEvent
    ? await a.guardian.client.rpc("record_review", {
        p_event_id: otherEvent.event_id,
        p_rating: ratingFor(Number(otherEvent.score_ratio)),
        p_card: cardPayload(otherCard!),
      })
    : { data: null, error: { message: "no second event" } };
  check("a guardian folds their learner's events (the marking path)", guardianFold.data?.[0]?.applied === true, guardianFold.error?.message);

  const { data: triviaEvent } = await admin
    .from("learning_events")
    .select("id")
    .eq("student_id", a.learner.profileId)
    .eq("event_type", "Active_Recall")
    .is("objective_id", null)
    .limit(1)
    .maybeSingle();
  const triviaFold = await learner.rpc("record_review", {
    p_event_id: triviaEvent?.id,
    p_rating: 3,
    p_card: cardPayload(firstCard),
  });
  check("an event with no objective is skipped", triviaFold.data?.[0]?.applied === false, triviaFold.error?.message);

  const { data: directCard } = await learner
    .from("fsrs_retention_items")
    .update({ stability: 99 })
    .eq("student_id", a.learner.profileId)
    .select("id");
  check("a learner cannot write the card directly", (directCard ?? []).length === 0);

  const { data: pendingAfter } = await learner.rpc("pending_review_events", {
    p_student: a.learner.profileId,
    p_limit: 100,
  });
  const after = (pendingAfter ?? []) as Array<{ event_id: string }>;
  check("folded events leave the pending list", !after.some((event) => event.event_id === firstEvent!.event_id));

  const { error: directLog } = await learner.from("fsrs_review_log").insert({
    // An event that is still waiting to be folded, so only RLS can refuse this insert.
    event_id: after[0]?.event_id ?? otherEvent?.event_id ?? firstEvent!.event_id,
    student_id: a.learner.profileId,
    objective_id: objective,
    score_ratio: 1,
    event_type: "Active_Recall",
    rating: 4,
    reviewed_at: new Date().toISOString(),
    due_at: new Date().toISOString(),
    stability: 1,
    difficulty: 1,
  });
  check("a learner cannot write the review log directly", Boolean(directLog));

  // ---- Step 4.4: mastery on read, and review compliance
  const { data: sqlMastery, error: sqlMasteryError } = await learner.rpc("objective_mastery", {
    p_student: a.learner.profileId,
  });
  const sqlRow = ((sqlMastery ?? []) as Array<{ objective_id: string; mastery: number; event_mastery: number; retrievability: number; covered: boolean }>).find(
    (row) => row.objective_id === objective,
  );

  const [{ data: masteryEvents }, { data: masteryCard }] = await Promise.all([
    admin
      .from("learning_events")
      .select("event_type, score_ratio, created_at")
      .eq("student_id", a.learner.profileId)
      .eq("objective_id", objective),
    admin
      .from("fsrs_retention_items")
      .select("stability, last_reviewed_at")
      .eq("student_id", a.learner.profileId)
      .eq("objective_id", objective)
      .maybeSingle(),
  ]);
  const nowForMastery = new Date();
  const tsRetrievability = masteryCard
    ? retrievabilityOf(
        { stability: Number(masteryCard.stability), lastReviewedAt: masteryCard.last_reviewed_at },
        nowForMastery,
      )
    : 0;
  const tsMastery = objectiveMasteryOf(
    (masteryEvents ?? []).map((event) => ({
      eventType: event.event_type,
      scoreRatio: Number(event.score_ratio),
      at: event.created_at,
    })),
    tsRetrievability,
    nowForMastery,
  );

  check(
    "objective_mastery returns the covered objective",
    !sqlMasteryError && Boolean(sqlRow) && sqlRow?.covered === true,
    sqlMasteryError?.message ?? JSON.stringify(sqlMastery),
  );
  check(
    "the SQL mastery matches the TypeScript twin",
    Boolean(sqlRow) && Math.abs(Number(sqlRow?.mastery) - tsMastery.mastery) < 0.001,
    JSON.stringify({ sql: sqlRow?.mastery, ts: tsMastery.mastery }),
  );

  const { data: bMastery } = await b.learner.client.rpc("objective_mastery", { p_student: a.learner.profileId });
  check("another learner reads no mastery for that student", ((bMastery ?? []) as unknown[]).length === 0);

  const moment = new Date();
  const stability = 10;
  const lastReviewed = new Date(moment.getTime() - 5 * 24 * 60 * 60 * 1000);
  const { data: sqlRetrievability, error: retrievabilityError } = await learner.rpc("fsrs_retrievability", {
    p_stability: stability,
    p_last_reviewed_at: lastReviewed.toISOString(),
    p_now: moment.toISOString(),
  });
  const tsCurve = retrievabilityOf({ stability, lastReviewedAt: lastReviewed.toISOString() }, moment);
  check(
    "the SQL forgetting curve matches ts-fsrs",
    !retrievabilityError && Math.abs(Number(sqlRetrievability) - tsCurve) < 0.001,
    retrievabilityError?.message ?? JSON.stringify({ sql: sqlRetrievability, ts: tsCurve }),
  );

  const { data: compliance, error: complianceError } = await learner.rpc("review_compliance", {
    p_student: a.learner.profileId,
  });
  const complianceRow = (compliance as Array<{ reviews: number; on_time: number }> | null)?.[0];
  check(
    "review compliance counts only reviews that had a due date",
    !complianceError && Number(complianceRow?.reviews) === 1 && Number(complianceRow?.on_time) === 1,
    complianceError?.message ?? JSON.stringify(complianceRow),
  );

  // ---- Step 4.5 and the Phase 4 exit gate: a lesson, then a wrong checkpoint on a fresh objective.
  // Mastery drops, a review is scheduled, and tomorrow's ranking puts the objective first.
  const { data: gateBank, error: gateBankError } = await a.guardian.client
    .from("question_templates")
    .insert(mcq(a.id, gateObjective, "Gate checkpoint"))
    .select("id")
    .single();
  check("gate: guardian writes a checkpoint", !gateBankError && Boolean(gateBank), gateBankError?.message);
  const gateLesson = await learner
    .from("learning_events")
    .insert({ student_id: a.learner.profileId, objective_id: gateObjective, event_type: "Exposure_Lesson", score_ratio: 0, actual_minutes_spent: 20 });
  check("gate: the learner finishes a lesson", !gateLesson.error, gateLesson.error?.message);

  const fold = async (prev: RetentionCard | null) => {
    const { data } = await learner.rpc("pending_review_events", { p_student: a.learner.profileId, p_limit: 100 });
    const event = ((data ?? []) as Array<{ event_id: string; objective_id: string; score_ratio: number; event_at: string }>).find(
      (row) => row.objective_id === gateObjective,
    );
    if (!event) return { card: prev, error: "no pending event" };
    const card = nextCard(prev, { scoreRatio: Number(event.score_ratio), at: new Date(event.event_at) });
    const { error } = await learner.rpc("record_review", {
      p_event_id: event.event_id,
      p_rating: ratingFor(Number(event.score_ratio)),
      p_card: cardPayload(card),
    });
    return { card, error: error?.message ?? null };
  };
  const masteryOf = async () => {
    const { data } = await learner.rpc("objective_mastery", { p_student: a.learner.profileId });
    return ((data ?? []) as Array<{ objective_id: string; mastery: number; last_event_at: string | null }>).find(
      (row) => row.objective_id === gateObjective,
    );
  };

  await learner.rpc("answer_checkpoint", { p_question_id: gateBank!.id, p_option: "B" });
  const afterRight = await fold(null);
  const masteryBefore = Number((await masteryOf())?.mastery ?? 0);
  const gateWrong = await learner.rpc("answer_checkpoint", { p_question_id: gateBank!.id, p_option: "A" });
  check("gate: the checkpoint is answered wrong", gateWrong.data?.[0]?.correct === false, gateWrong.error?.message);
  const afterWrong = await fold(afterRight.card);
  const gateRow = await masteryOf();
  const masteryAfter = Number(gateRow?.mastery ?? 0);
  check(
    "gate: mastery drops after the wrong answer",
    !afterRight.error && !afterWrong.error && masteryAfter < masteryBefore,
    JSON.stringify({ before: masteryBefore, after: masteryAfter, errors: [afterRight.error, afterWrong.error] }),
  );
  await learner.from("mistake_notebook").insert({ student_id: a.learner.profileId, objective_id: gateObjective, error_category: "ConceptGap", question_snapshot: "Gate checkpoint", correct_model_answer: "B", source: "student" });

  const { data: gateCard } = await admin
    .from("fsrs_retention_items")
    .select("due_at")
    .eq("student_id", a.learner.profileId)
    .eq("objective_id", gateObjective)
    .maybeSingle();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dueAt = gateCard?.due_at ? new Date(gateCard.due_at) : null;
  check(
    "gate: an FSRS review is scheduled by tomorrow",
    Boolean(dueAt) && dueAt!.getTime() <= tomorrow.getTime(),
    JSON.stringify(gateCard),
  );

  // Tomorrow's ranking, built the way getLearnerWorkspace builds it, against a peer objective in the
  // same subject that the learner has never touched (the strongest competing signal a fresh objective has).
  const DAY_MS = 24 * 60 * 60 * 1000;
  const { data: openGate } = await admin
    .from("mistake_notebook")
    .select("id")
    .eq("student_id", a.learner.profileId)
    .eq("objective_id", gateObjective)
    .is("resolved_at", null);
  const signal = (code: string, over: Partial<ActivitySignal>): ActivitySignal => ({
    objectiveCode: code, subjectCode: "S", subjectName: "S", topicName: "T", objectiveText: code, commandWord: "Describe",
    tier: "Both", minutes: 20, mastery: 0, openMistakes: 0, lastStudiedDaysAgo: null, daysUntilAssessment: null,
    assessmentTitle: null, hasLesson: true, reviewOverdueDays: null, ...over,
  });
  const [top] = rankActivities(
    [
      signal("peer-never-studied", {}),
      signal("gate", {
        mastery: masteryAfter,
        openMistakes: (openGate ?? []).length,
        lastStudiedDaysAgo: gateRow?.last_event_at ? Math.floor((tomorrow.getTime() - Date.parse(gateRow.last_event_at)) / DAY_MS) : null,
        reviewOverdueDays: dueAt && dueAt <= tomorrow ? Math.floor((tomorrow.getTime() - dueAt.getTime()) / DAY_MS) : null,
      }),
    ],
    1,
  );
  check("gate: tomorrow's plan picks the missed objective", top?.objectiveCode === "gate", JSON.stringify(top && { code: top.objectiveCode, score: top.score, reasons: top.reasons }));

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
