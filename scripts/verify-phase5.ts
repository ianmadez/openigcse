/**
 * Phase 5 at the database layer, with real JWTs: structured requests and their effects,
 * messages and read receipts, notifications and push subscriptions, the heartbeat and the
 * parent's remote actions. Two throwaway households; everything is deleted in `finally`.
 *
 *   pnpm verify:phase5
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnv } from "./lib/env";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TAG = `phase5-probe-${Date.now()}`;
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


const MIN = 60 * 1000;

async function notificationsFor(who: Person, kind: string) {
  const { data } = await who.client.from("notifications").select("id, kind, title, body, request_id").eq("kind", kind);
  return data ?? [];
}

async function run() {
  const a = await household("a");
  const b = await household("b");
  const learner = a.learner.client;
  const guardian = a.guardian.client;
  const raise = (row: Record<string, unknown>) =>
    learner.from("requests").insert({ household_id: a.id, student_id: a.learner.profileId, ...row }).select("id").single();
  const decide = (who: SupabaseClient, id: string, decision: string, note: string | null = null) =>
    who.rpc("decide_request", { p_request_id: id, p_decision: decision, p_note: note });

  // ============================================================ 5.1 requests
  const { data: brk, error: brkError } = await raise({ request_type: "break", student_note: "ten please" });
  check("learner raises a break request", !brkError && Boolean(brk), brkError?.message);
  const guardianAsk = await notificationsFor(a.guardian, "request");
  check("the guardian is notified of the ask", guardianAsk.some((row) => row.request_id === brk?.id), JSON.stringify(guardianAsk));
  check("the learner gets no copy of their own ask", (await notificationsFor(a.learner, "request")).length === 0);

  const { error: selfApproved } = await raise({ request_type: "break", status: "approved", decision: "15" });
  check("learner cannot insert an approved request", Boolean(selfApproved));
  const { data: selfUpdate } = await learner.from("requests").update({ status: "approved", decision: "15" }).eq("id", brk!.id).select("id");
  check("learner cannot approve its own request", (selfUpdate ?? []).length === 0);
  const { error: forOther } = await learner
    .from("requests")
    .insert({ household_id: a.id, student_id: b.learner.profileId, request_type: "break" });
  check("learner cannot raise for another learner", Boolean(forOther));
  const learnerDecides = await decide(learner, brk!.id, "10");
  check("learner cannot call decide_request", Boolean(learnerDecides.error));
  const foreignDecides = await decide(b.guardian.client, brk!.id, "10");
  check("another household's guardian cannot answer", Boolean(foreignDecides.error));
  const wrongAnswer = await decide(guardian, brk!.id, "approve");
  check("an answer that does not fit the type is refused", Boolean(wrongAnswer.error));

  const before = Date.now();
  const approved = await decide(guardian, brk!.id, "10", "back by the bell");
  const until = Date.parse(approved.data?.[0]?.effect_until ?? "");
  check(
    "a 10-minute break is approved with its end time",
    !approved.error && approved.data?.[0]?.status === "approved" && Math.abs(until - (before + 10 * MIN)) < 30 * 1000,
    approved.error?.message ?? JSON.stringify(approved.data),
  );
  const decidedNote = await notificationsFor(a.learner, "request_decided");
  check(
    "the learner is notified of the answer",
    decidedNote.some((row) => row.request_id === brk!.id && row.body === "back by the bell"),
    JSON.stringify(decidedNote),
  );
  const twice = await decide(guardian, brk!.id, "15");
  check("a request is answered once", Boolean(twice.error));

  // stuck -> skip defers the item; swap exchanges two periods
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(new Date());
  const { data: items } = await admin
    .from("day_plan_items")
    .insert([
      { household_id: a.id, student_id: a.learner.profileId, plan_date: today, sequence: 1, item_type: "lesson", title: "Maths", planned_minutes: 30 },
      { household_id: a.id, student_id: a.learner.profileId, plan_date: today, sequence: 2, item_type: "lesson", title: "Chemistry", planned_minutes: 30 },
    ])
    .select("id, title");
  const maths = items!.find((item) => item.title === "Maths")!.id as string;
  const chemistry = items!.find((item) => item.title === "Chemistry")!.id as string;

  const { data: swap } = await raise({ request_type: "swap", day_plan_item_id: maths, payload: { withItemId: chemistry } });
  const swapped = await decide(guardian, swap!.id, "approve");
  const { data: order } = await admin.from("day_plan_items").select("title, sequence").in("id", [maths, chemistry]).order("sequence");
  check(
    "an approved swap exchanges the two periods",
    !swapped.error && order?.map((row) => row.title).join() === "Chemistry,Maths",
    swapped.error?.message ?? JSON.stringify(order),
  );

  const { data: stuck } = await raise({ request_type: "stuck", day_plan_item_id: maths, student_note: "vectors" });
  const skipped = await decide(guardian, stuck!.id, "skip");
  const { data: mathsRow } = await admin.from("day_plan_items").select("status").eq("id", maths).single();
  check("stuck + skip moves the item off today", !skipped.error && mathsRow?.status === "deferred", skipped.error?.message ?? mathsRow?.status);

  const { data: unlock } = await raise({ request_type: "unlock", student_note: "research" });
  await decide(guardian, unlock!.id, "15");
  const { data: focus } = await admin.from("focus_policies").select("is_locked, lock_ends_at").eq("household_id", a.id).maybeSingle();
  check("an approved unlock opens the focus policy until it ends", focus?.is_locked === false && Boolean(focus?.lock_ends_at), JSON.stringify(focus));

  // more time on an open sitting
  const { data: quiz } = await guardian
    .from("term_assessments")
    .insert({
      academic_term_id: a.termId,
      student_id: a.learner.profileId,
      assessment_category: "WeeklyQuiz",
      title: "Probe quiz",
      duration_minutes: 20,
      total_marks: 1,
      status: "Scheduled",
    })
    .select("id")
    .single();
  const { data: sitting } = await admin
    .from("assessment_sittings")
    .insert({ household_id: a.id, student_id: a.learner.profileId, assessment_id: quiz!.id })
    .select("id")
    .single();
  const { data: more } = await raise({ request_type: "more_time", term_assessment_id: quiz!.id, payload: { minutes: 20 } });
  const extended = await decide(guardian, more!.id, "approve");
  const { data: sittingRow } = await admin.from("assessment_sittings").select("extra_minutes").eq("id", sitting!.id).single();
  check(
    "approved more time extends the sitting",
    !extended.error && sittingRow?.extra_minutes === 20,
    extended.error?.message ?? JSON.stringify(sittingRow),
  );

  const { data: dayOff } = await raise({ request_type: "day_off", student_note: "headache" });
  const offApproved = await decide(guardian, dayOff!.id, "approve");
  const { data: override } = await admin.from("timetable_overrides").select("override_type, override_date").eq("household_id", a.id).maybeSingle();
  const { data: chemRow } = await admin.from("day_plan_items").select("status").eq("id", chemistry).single();
  check(
    "an approved day off marks today sick and rolls the plan over",
    !offApproved.error && override?.override_type === "sick_day" && override?.override_date === today && chemRow?.status === "deferred",
    offApproved.error?.message ?? JSON.stringify({ override, chemRow }),
  );

  const { data: stale } = await admin
    .from("requests")
    .insert({
      household_id: a.id,
      student_id: a.learner.profileId,
      request_type: "check_work",
      created_at: new Date(Date.now() - 5 * 60 * MIN).toISOString(),
    })
    .select("id")
    .single();
  const staleAnswer = await decide(guardian, stale!.id, "reviewing");
  const { data: staleRow } = await admin.from("requests").select("status").eq("id", stale!.id).single();
  check(
    "a four-hour-old ask has expired",
    !staleAnswer.error && staleAnswer.data?.[0]?.status === "expired" && staleRow?.status === "expired",
    staleAnswer.error?.message ?? staleRow?.status,
  );

  const { data: bSees } = await b.guardian.client.from("requests").select("id").eq("household_id", a.id);
  check("another household reads none of the requests", (bSees ?? []).length === 0);

  // ============================================================ 5.2 messages
  const { data: msg, error: msgError } = await learner
    .from("messages")
    .insert({ household_id: a.id, sender_profile_id: a.learner.profileId, body: "Done with maths" })
    .select("id")
    .single();
  check("learner sends a message", !msgError && Boolean(msg), msgError?.message);
  check("the guardian is notified of the message", (await notificationsFor(a.guardian, "message")).length === 1);
  const { error: emptyMsg } = await learner.from("messages").insert({ household_id: a.id, sender_profile_id: a.learner.profileId, body: "" });
  check("an empty message without an attachment is refused", Boolean(emptyMsg));
  const { error: foreignPath } = await learner.from("messages").insert({
    household_id: a.id,
    sender_profile_id: a.learner.profileId,
    body: "",
    attachment_kind: "image",
    attachment_path: `${b.id}/messages/${a.learner.profileId}/x.png`,
  });
  check("an attachment outside the household folder is refused", Boolean(foreignPath));
  const { error: asOther } = await guardian
    .from("messages")
    .insert({ household_id: a.id, sender_profile_id: a.learner.profileId, body: "forged" });
  check("nobody sends as someone else", Boolean(asOther));
  const { data: edited } = await guardian.from("messages").update({ body: "edited" }).eq("id", msg!.id).select("id");
  check("messages cannot be edited", (edited ?? []).length === 0);
  await learner.rpc("mark_messages_read");
  const { data: stillUnread } = await admin.from("messages").select("read_at").eq("id", msg!.id).single();
  check("the sender reading the thread does not mark their own message read", stillUnread?.read_at === null);
  await guardian.rpc("mark_messages_read");
  const { data: readRow } = await admin.from("messages").select("read_at").eq("id", msg!.id).single();
  check("the recipient's read sets the receipt", Boolean(readRow?.read_at));
  const { data: bMessages } = await b.learner.client.from("messages").select("id").eq("household_id", a.id);
  check("another household reads no messages", (bMessages ?? []).length === 0);

  // ============================================================ 5.3 notifications and push
  const { error: forgedNote } = await learner
    .from("notifications")
    .insert({ household_id: a.id, recipient_profile_id: a.guardian.profileId, kind: "x", title: "x", body: "x" });
  check("learner cannot write notifications", Boolean(forgedNote));
  const { data: peek } = await learner.from("notifications").select("id").eq("recipient_profile_id", a.guardian.profileId);
  check("learner cannot read the guardian's notifications", (peek ?? []).length === 0);
  const marked = await learner.rpc("mark_notifications_read");
  const { data: guardianUnread } = await admin
    .from("notifications")
    .select("id")
    .eq("recipient_profile_id", a.guardian.profileId)
    .is("read_at", null);
  check("marking read touches only one's own", !marked.error && (guardianUnread ?? []).length > 0, marked.error?.message);

  const sub = {
    household_id: a.id,
    profile_id: a.guardian.profileId,
    endpoint: `https://push.example/${TAG}`,
    p256dh: "k",
    auth_secret: "s",
  };
  const { error: subError } = await guardian.from("push_subscriptions").insert(sub);
  check("guardian registers a push subscription", !subError, subError?.message);
  const { data: subPeek } = await learner.from("push_subscriptions").select("id");
  check("learner cannot read the guardian's push keys", (subPeek ?? []).length === 0);
  const { error: subForOther } = await learner.from("push_subscriptions").insert({ ...sub, endpoint: `${sub.endpoint}/2` });
  check("nobody registers a subscription for someone else", Boolean(subForOther));

  await admin.from("assessment_sittings").update({ submitted_at: new Date().toISOString() }).eq("id", sitting!.id);
  check("a handed-in test notifies the guardian", (await notificationsFor(a.guardian, "test_submitted")).length === 1);

  // ============================================================ 5.4 live monitor
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Dar_es_Salaam" }));
  const dow = ((local.getDay() + 6) % 7) + 1;
  await admin.from("timetable_slots").insert({
    household_id: a.id,
    academic_term_id: a.termId,
    day_of_week: dow,
    start_time: "00:00",
    end_time: "23:59:59",
    slot_type: "subject",
    title: "Probe period",
  });

  const beat = (args: Record<string, unknown> = {}) =>
    learner.rpc("record_heartbeat", { p_route: "/today", p_item: chemistry, p_focus: "visible", p_timer_running: false, ...args });
  const first = await beat();
  check("the learner's heartbeat opens today's session", !first.error && Boolean(first.data?.[0]?.session_id), first.error?.message);
  const sessionId = first.data?.[0]?.session_id as string;
  const guardianBeat = await guardian.rpc("record_heartbeat", { p_route: "/parent" });
  check("a guardian cannot send a heartbeat", Boolean(guardianBeat.error));
  const { data: live } = await guardian.from("kiosk_sessions").select("current_route, timer_running, idle_since").eq("id", sessionId).single();
  check(
    "the guardian reads the live session",
    live?.current_route === "/today" && live?.timer_running === false && Boolean(live?.idle_since),
    JSON.stringify(live),
  );
  const { data: bLive } = await b.guardian.client.from("kiosk_sessions").select("id").eq("id", sessionId);
  check("another household cannot see it", (bLive ?? []).length === 0);
  const { error: directKiosk } = await learner.from("kiosk_sessions").insert({ student_id: a.learner.profileId });
  check("learner cannot write kiosk rows directly", Boolean(directKiosk));

  await admin.from("kiosk_sessions").update({ idle_since: new Date(Date.now() - 16 * MIN).toISOString() }).eq("id", sessionId);
  await beat();
  await beat();
  check("15 idle minutes in a lesson period alert the guardian once", (await notificationsFor(a.guardian, "idle")).length === 1);
  await beat({ p_timer_running: true });
  const { data: running } = await admin.from("kiosk_sessions").select("idle_since").eq("id", sessionId).single();
  check("starting the timer clears idle", running?.idle_since === null);

  const sent = await guardian.rpc("parent_live_action", { p_action: "message", p_message: "Lunch in 5" });
  const afterMessage = await beat({ p_timer_running: true });
  check(
    "a message pushed to the screen reaches the heartbeat",
    !sent.error && afterMessage.data?.[0]?.screen_message === "Lunch in 5",
    sent.error?.message ?? JSON.stringify(afterMessage),
  );
  const learnerRemote = await learner.rpc("parent_live_action", { p_action: "lock" });
  check("the learner cannot use remote actions", Boolean(learnerRemote.error));

  await guardian.rpc("parent_live_action", { p_action: "end_break" });
  const { data: brkRow } = await admin.from("requests").select("effect_until").eq("id", brk!.id).single();
  // Ask the database how long is left: this machine's clock can drift seconds from the server's.
  const { data: leftAfterEnd } = await admin.rpc("seconds_left", { p_until: brkRow!.effect_until });
  check("end break stops the running break", Number(leftAfterEnd) <= 1, `${leftAfterEnd}s left`);
  await guardian.rpc("parent_live_action", { p_action: "lock" });
  const { data: locked } = await admin.from("focus_policies").select("is_locked").eq("household_id", a.id).single();
  await guardian.rpc("parent_live_action", { p_action: "unlock", p_minutes: 30 });
  const { data: unlocked } = await admin.from("focus_policies").select("is_locked, lock_ends_at").eq("household_id", a.id).single();
  check(
    "lock now and unlock for N minutes",
    locked?.is_locked === true && unlocked?.is_locked === false && Date.parse(unlocked!.lock_ends_at) > Date.now() + 29 * MIN,
  );

  const ended = await guardian.rpc("parent_live_action", { p_action: "end_day" });
  const afterEnd = await beat();
  const digest = await notificationsFor(a.guardian, "digest");
  check(
    "end the school day ends it on the device and sends one digest",
    !ended.error && afterEnd.data?.[0]?.day_ended === true && digest.length === 1,
    ended.error?.message ?? JSON.stringify(digest),
  );
  await guardian.rpc("parent_live_action", { p_action: "end_day" });
  check("the digest is not sent twice", (await notificationsFor(a.guardian, "digest")).length === 1);
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
