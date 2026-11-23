/**
 * A throwaway household for checking screens in a real browser session.
 *
 *   pnpm dev:household create   # prints the guardian/learner sign-ins and PIN
 *   pnpm dev:household delete   # removes everything create made
 *
 * State lives in .superpowers/dev-household.json (git-ignored). Only rows this
 * script created are ever deleted: it deletes by the ids it recorded.
 */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "./lib/env";

loadEnv();

const STATE = ".superpowers/dev-household.json";
const PIN = "246810";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type State = {
  householdId: string;
  userIds: string[];
  guardian: { email: string; password: string; profileId: string };
  learner: { email: string; password: string; profileId: string };
  termIds: string[];
  pin: string;
};

function pinHash(pin: string) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

async function user(tag: string, label: string) {
  const email = `${tag}-${label}@example.com`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`${label}: ${error?.message}`);
  return { email, password, id: data.user.id };
}

async function create() {
  if (existsSync(STATE)) throw new Error(`${STATE} exists. Run "delete" first.`);
  const tag = `dev-household-${Date.now()}`;

  const { data: household, error } = await admin
    .from("households")
    .insert({ name: `${tag}`, onboarding_completed: true, guardian_pin_hash: pinHash(PIN) })
    .select("id")
    .single();
  if (error) throw error;

  const state: State = {
    householdId: household.id,
    userIds: [],
    guardian: { email: "", password: "", profileId: "" },
    learner: { email: "", password: "", profileId: "" },
    termIds: [],
    pin: PIN,
  };
  mkdirSync(".superpowers", { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2));

  for (const [key, role] of [
    ["guardian", "parent_educator"],
    ["learner", "student"],
  ] as const) {
    const account = await user(tag, key);
    state.userIds.push(account.id);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        household_id: household.id,
        display_name: key === "guardian" ? "Test Guardian" : "Test Learner",
        role,
        auth_user_id: account.id,
        target_exam_series: key === "learner" ? "June 2028" : null,
      })
      .select("id")
      .single();
    if (profileError) throw profileError;
    state[key] = { email: account.email, password: account.password, profileId: profile.id };
    writeFileSync(STATE, JSON.stringify(state, null, 2));
  }

  const { data: terms, error: termError } = await admin
    .from("academic_terms")
    .insert([
      { household_id: household.id, name: "Test Term 1", start_date: "2026-09-01", end_date: "2026-12-05", status: "active" },
      { household_id: household.id, name: "Test Term 2", start_date: "2027-01-12", end_date: "2027-04-10", status: "upcoming" },
    ])
    .select("id");
  if (termError) throw termError;
  state.termIds = terms.map((term) => term.id);

  const { data: route } = await admin.from("entry_routes").select("id").limit(1).single();
  if (route) {
    await admin.from("learner_term_enrollments").insert(
      state.termIds.map((termId) => ({
        student_id: state.learner.profileId,
        academic_term_id: termId,
        entry_route_id: route.id,
        weekly_allocated_minutes: 240,
        target_exam_series: "June 2028",
      })),
    );
  }

  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ guardian: state.guardian.email, learner: state.learner.email, pin: PIN }, null, 2));
}

async function remove() {
  if (!existsSync(STATE)) return console.log("Nothing to delete.");
  const state = JSON.parse(readFileSync(STATE, "utf8")) as State;

  const { data: files } = await admin.storage.from("household-files").list(state.householdId, { limit: 1000 });
  for (const folder of files ?? []) {
    const { data: nested } = await admin.storage.from("household-files").list(`${state.householdId}/${folder.name}`, { limit: 1000 });
    for (const owner of nested ?? []) {
      const prefix = `${state.householdId}/${folder.name}/${owner.name}`;
      const { data: leaf } = await admin.storage.from("household-files").list(prefix, { limit: 1000 });
      const paths = (leaf ?? []).map((file) => `${prefix}/${file.name}`);
      if (paths.length) await admin.storage.from("household-files").remove(paths);
    }
  }

  await admin.from("households").delete().eq("id", state.householdId);
  for (const id of state.userIds) await admin.auth.admin.deleteUser(id);

  const { data: left } = await admin.from("households").select("id").eq("id", state.householdId);
  rmSync(STATE);
  console.log(`Deleted household ${state.householdId} and ${state.userIds.length} users; ${left?.length ?? 0} left.`);
}

const command = process.argv[2];
(command === "create" ? create() : command === "delete" ? remove() : Promise.reject(new Error("create | delete"))).catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
