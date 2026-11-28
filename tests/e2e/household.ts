import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "../../scripts/lib/env";

/**
 * The school-day test's household (Phase 8 exit gate). It runs only against staging: the local
 * Docker Supabase in `.env.local`, or CI's fresh stack. It refuses a remote Supabase URL so the
 * live household can never be touched.
 */
export const STATE = ".superpowers/e2e-household.json";

export type E2EState = {
  householdId: string;
  termIds: string[];
  pin: string;
  guardian: { email: string; password: string; profileId: string };
  learner: { email: string; password: string; profileId: string };
};

export function stagingAdmin() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error(`The school-day test runs only against local staging Supabase, not ${url || "an unset URL"}.`);
  }
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function readState(): E2EState {
  return JSON.parse(readFileSync(STATE, "utf8")) as E2EState;
}

/** ISO weekday (1 = Monday) in the household's default time zone. */
function weekdayIn(timeZone: string) {
  const name = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

export async function createHousehold() {
  const admin = stagingAdmin();
  const env = { ...process.env, DEV_HOUSEHOLD_STATE: STATE };
  if (existsSync(STATE)) execSync("pnpm -s dev:household delete", { env, stdio: "inherit" });
  execSync("pnpm -s dev:household create", { env, stdio: "inherit" });
  const state = readState();

  // Today's timetable: one subject block across the whole school day, so the test can run at any hour.
  const { data: household } = await admin.from("households").select("timezone").eq("id", state.householdId).single();
  const { data: enrolment, error } = await admin
    .from("learner_term_enrollments")
    .select("academic_term_id, entry_routes!inner(syllabus_versions!inner(subject_id))")
    .eq("student_id", state.learner.profileId)
    .eq("academic_term_id", state.termIds[0]!)
    .single<{ academic_term_id: string; entry_routes: { syllabus_versions: { subject_id: string } } }>();
  if (error || !enrolment) throw new Error(`The test household has no enrolment: ${error?.message}`);

  const { error: slotError } = await admin.from("timetable_slots").insert({
    household_id: state.householdId,
    academic_term_id: enrolment.academic_term_id,
    day_of_week: weekdayIn(household?.timezone ?? "Africa/Dar_es_Salaam"),
    start_time: "00:05",
    end_time: "23:55",
    slot_type: "subject",
    subject_id: enrolment.entry_routes.syllabus_versions.subject_id,
    title: "E2E study block",
  });
  if (slotError) throw new Error(`timetable slot: ${slotError.message}`);
  return state;
}

export function deleteHousehold() {
  if (existsSync(STATE)) execSync("pnpm -s dev:household delete", { env: { ...process.env, DEV_HOUSEHOLD_STATE: STATE }, stdio: "inherit" });
}

/** An MCQ checkpoint on the objective today's plan chose; the key is B. */
export async function addCheckpoint(state: E2EState, objectiveId: string) {
  const admin = stagingAdmin();
  const { error } = await admin.from("question_templates").insert({
    household_id: state.householdId,
    objective_id: objectiveId,
    question_type: "MCQ",
    prompt_template: "E2E checkpoint: which word names the basic economic problem?",
    options_schema: [
      { letter: "A", text: "Surplus", correct: false },
      { letter: "B", text: "Scarcity", correct: true },
      { letter: "C", text: "Inflation", correct: false },
    ],
    mark_scheme_rubric: "B",
    max_marks: 1,
    tier: "Both",
  });
  if (error) throw new Error(`checkpoint: ${error.message}`);
}

/** A draft quiz for today with one two-mark short answer; the guardian schedules it in the UI. */
export async function addDraftQuiz(state: E2EState, objectiveId: string) {
  const admin = stagingAdmin();
  const { data: enrolment } = await admin
    .from("learner_term_enrollments")
    .select("entry_route_id")
    .eq("student_id", state.learner.profileId)
    .eq("academic_term_id", state.termIds[0]!)
    .single();
  const { data: question, error: questionError } = await admin
    .from("question_templates")
    .insert({
      household_id: state.householdId,
      objective_id: objectiveId,
      question_type: "ShortAnswer",
      prompt_template: "E2E quiz: define scarcity in one sentence.",
      mark_scheme_rubric: "1 mark for limited resources, 1 mark for unlimited wants.",
      max_marks: 2,
      tier: "Both",
    })
    .select("id")
    .single();
  if (questionError) throw new Error(`quiz question: ${questionError.message}`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(new Date());
  const { data: quiz, error: quizError } = await admin
    .from("term_assessments")
    .insert({
      academic_term_id: state.termIds[0]!,
      entry_route_id: enrolment?.entry_route_id ?? null,
      student_id: state.learner.profileId,
      assessment_category: "WeeklyQuiz",
      title: "E2E weekly quiz",
      duration_minutes: 15,
      total_marks: 2,
      scheduled_date: today,
      status: "Draft",
    })
    .select("id")
    .single();
  if (quizError) throw new Error(`quiz: ${quizError.message}`);
  const { error: itemError } = await admin
    .from("assessment_items")
    .insert({ assessment_id: quiz.id, question_template_id: question.id, sequence: 1, marks_available: 2 });
  if (itemError) throw new Error(`quiz item: ${itemError.message}`);
  return quiz.id as string;
}

/** The objective of today's first planned lesson. */
export async function todaysObjective(state: E2EState) {
  const admin = stagingAdmin();
  const { data, error } = await admin
    .from("day_plan_items")
    .select("learning_objective_id")
    .eq("student_id", state.learner.profileId)
    .not("learning_objective_id", "is", null)
    .limit(1)
    .single();
  if (error || !data) throw new Error(`No planned lesson: ${error?.message}`);
  return data.learning_objective_id as string;
}
