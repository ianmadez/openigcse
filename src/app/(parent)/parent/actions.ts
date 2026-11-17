"use server";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createGateToken, PARENT_GATE_COOKIE, PARENT_GATE_TTL_MS } from "@/lib/auth/gate";
import { getAuthUser } from "@/lib/auth/session";
import { resolveActiveHousehold } from "@/lib/data/household";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 10;

export type UnlockState = { error?: string } | null;
export type OnboardingState = { error?: string; step?: number } | null;

/** Salted scrypt hash: the plain PIN never reaches the database. */
function hashPin(pin: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, 32);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

function verifyHash(pin: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const derived = scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Which household the PIN belongs to. A signed-in guardian is authoritative;
 * on a device that has not been signed in yet we fall back to the household
 * created by onboarding, which is what the single-device install relies on.
 */
const resolveHousehold = resolveActiveHousehold;

/** Failed attempts inside the rolling lockout window, newest first. */
async function recentFailures(householdId: string) {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { data } = await admin
    .from("pin_attempt_logs")
    .select("id, created_at, locked_until")
    .eq("household_id", householdId)
    .eq("succeeded", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  return data ?? [];
}

function minutesRemaining(rows: { created_at: string; locked_until: string | null }[]) {
  const locked = rows.map((row) => row.locked_until).filter((value): value is string => Boolean(value));
  const newest = rows[0]?.created_at ?? new Date().toISOString();
  const unlockAt = locked.length
    ? Math.max(...locked.map((value) => new Date(value).getTime()))
    : new Date(newest).getTime() + LOCKOUT_MINUTES * 60 * 1000;

  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
}

/** Verifies the guardian PIN against the household hash, then the env fallback. */
async function pinMatches(pin: string, householdId: string | null) {
  if (householdId) {
    try {
      const client = createAdminClient();
      const { data } = await client
        .from("households")
        .select("guardian_pin_hash")
        .eq("id", householdId)
        .maybeSingle<{ guardian_pin_hash: string | null }>();

      if (data?.guardian_pin_hash) return verifyHash(pin, data.guardian_pin_hash);
    } catch {
      // Fall through to the environment PIN so a broken database cannot lock you out.
    }
  }

  return pin === (process.env.PARENT_MASTER_PIN ?? "1234");
}

async function logAttempt(input: {
  householdId: string;
  profileId: string | null;
  succeeded: boolean;
  lockedUntil?: string | null;
}) {
  const admin = createAdminClient();
  await admin.from("pin_attempt_logs").insert({
    household_id: input.householdId,
    actor_profile_id: input.profileId,
    succeeded: input.succeeded,
    locked_until: input.lockedUntil ?? null,
  });
}

/** Tells the guardian the household is locked rather than only refusing the PIN. */
async function notifyLockout(householdId: string, profileId: string | null, minutes: number) {
  const admin = createAdminClient();
  let recipient = profileId;

  // A device that unlocked with the PIN alone has no session, so the guardian
  // is resolved from the household instead of the caller.
  if (!recipient) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("household_id", householdId)
      .neq("role", "student")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();

    recipient = data?.id ?? null;
  }

  if (!recipient) return;

  await admin.from("notifications").insert({
    household_id: householdId,
    recipient_profile_id: recipient,
    kind: "pin_lockout",
    title: "Guardian PIN locked",
    body: `${MAX_FAILED_ATTEMPTS} wrong PIN attempts were made in ${LOCKOUT_MINUTES} minutes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    link_url: "/parent",
  });
}

/** Issues the signed gate cookie: eight hours of parent access, no longer. */
async function setGateCookie() {
  const store = await cookies();
  const { value } = createGateToken();

  store.set(PARENT_GATE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(PARENT_GATE_TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });
}

export async function unlockParent(_previous: UnlockState, formData: FormData): Promise<UnlockState> {
  const pin = String(formData.get("pin") ?? "").trim();

  if (!/^\d{4,6}$/.test(pin)) return { error: "Enter the 4 to 6 digit PIN." };

  let household: Awaited<ReturnType<typeof resolveHousehold>> = null;

  try {
    household = await resolveHousehold();
  } catch {
    // No database: the environment PIN still has to work.
  }

  if (household) {
    const failures = await recentFailures(household.householdId);

    if (failures.length >= MAX_FAILED_ATTEMPTS) {
      const minutes = minutesRemaining(failures);
      return { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
    }

    const ok = await pinMatches(pin, household.householdId);
    const remaining = failures.length + 1;
    const locking = !ok && remaining >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = locking ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString() : null;

    await logAttempt({
      householdId: household.householdId,
      profileId: household.profileId,
      succeeded: ok,
      lockedUntil,
    });

    if (!ok) {
      if (locking) {
        await notifyLockout(household.householdId, household.profileId, LOCKOUT_MINUTES);
        return { error: `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.` };
      }

      const left = MAX_FAILED_ATTEMPTS - remaining;
      return {
        error: `That PIN does not match. ${left} attempt${left === 1 ? "" : "s"} left before a ${LOCKOUT_MINUTES} minute lock.`,
      };
    }
  } else if (!(await pinMatches(pin, null))) {
    return { error: "That PIN does not match. Try again." };
  }

  await setGateCookie();

  redirect("/parent");
}

export async function lockParent() {
  const store = await cookies();
  store.delete(PARENT_GATE_COOKIE);
  redirect("/parent");
}

const onboardingSchema = z.object({
  householdName: z.string().min(2).max(80),
  countryCode: z.string().length(2),
  timezone: z.string().min(3),
  guardianName: z.string().min(1).max(60),
  relationship: z.string().min(2).max(20),
  pin: z.string().regex(/^\d{4,6}$/),
  learnerName: z.string().min(1).max(60),
  stage: z.string().min(2).max(40),
  candidateType: z.enum(["Private Candidate", "School Candidate"]),
  seriesMonth: z.enum(["March", "June", "November"]),
  seriesYear: z.coerce.number().int().min(2027).max(2031),
  term1Start: z.string().min(8),
  term1End: z.string().min(8),
  term2Start: z.string().min(8),
  term2End: z.string().min(8),
  term3Start: z.string().min(8),
  term3End: z.string().min(8),
  midtermWeek: z.string().min(8),
  finalWeek: z.string().min(8),
  studyDays: z.string().default("Mon,Tue,Wed,Thu,Fri"),
  dailyMinutesCap: z.coerce.number().int().min(30).max(480),
  subjects: z.string().default(""),
  elective: z.string().default(""),
});

const TERM_LABEL = ["Term 1", "Term 2", "Term 3"] as const;

/**
 * Persists the whole onboarding result.
 *
 * The write is idempotent: when the signed-in guardian already has a household
 * the wizard edits those rows in place instead of creating a second household.
 * That matters because the wizard doubles as the household screen, so a family
 * that reopens it must not fork its data.
 */
export async function completeOnboardingAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      step: 1,
    };
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Supabase is not configured, so the household cannot be saved yet." };
  }

  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in as the guardian before saving the household.", step: 1 };
  }

  const input = parsed.data;
  const client = createAdminClient();
  const series = `${input.seriesMonth} ${input.seriesYear}`;
  let createdHouseholdId: string | null = null;

  try {
    const { data: guardian } = await client
      .from("profiles")
      .select("id, household_id, role")
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle<{ id: string; household_id: string | null; role: string }>();

    let householdId = guardian?.household_id ?? null;
    let guardianProfileId = guardian?.id ?? null;

    const householdRow = {
      name: input.householdName,
      country_code: input.countryCode.toUpperCase(),
      cambridge_admin_zone: zoneFor(input.countryCode),
      timezone: input.timezone,
      guardian_pin_hash: hashPin(input.pin),
      onboarding_completed: true,
    };

    if (householdId) {
      const { error } = await client.from("households").update(householdRow).eq("id", householdId);
      if (error) throw new Error(error.message);

      const { error: guardianError } = await client
        .from("profiles")
        .update({ display_name: input.guardianName, relationship: input.relationship })
        .eq("id", guardianProfileId!);
      if (guardianError) throw new Error(guardianError.message);
    } else {
      const { data: household, error: householdError } = await client
        .from("households")
        .insert(householdRow)
        .select("id")
        .single<{ id: string }>();

      if (householdError || !household) throw new Error(householdError?.message ?? "Household was not created");

      householdId = household.id;
      createdHouseholdId = household.id;

      const { data: created, error: guardianError } = await client
        .from("profiles")
        .insert({
          household_id: householdId,
          display_name: input.guardianName,
          role: "parent_educator",
          relationship: input.relationship,
          auth_user_id: user.id,
        })
        .select("id")
        .single<{ id: string }>();

      if (guardianError || !created) throw new Error(guardianError?.message ?? "Guardian was not created");
      guardianProfileId = created.id;
    }

    if (!householdId) throw new Error("Household was not resolved");

    const learnerRow = {
      display_name: input.learnerName,
      year_group: input.stage,
      candidate_type: input.candidateType,
      target_exam_series: series,
    };

    const { data: existingLearner } = await client
      .from("profiles")
      .select("id")
      .eq("household_id", householdId)
      .eq("role", "student")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();

    let learnerId = existingLearner?.id ?? null;

    if (learnerId) {
      const { error } = await client.from("profiles").update(learnerRow).eq("id", learnerId);
      if (error) throw new Error(error.message);
    } else {
      const { data: learner, error } = await client
        .from("profiles")
        .insert({ ...learnerRow, household_id: householdId, role: "student" })
        .select("id")
        .single<{ id: string }>();

      if (error || !learner) throw new Error(error?.message ?? "Learner was not created");
      learnerId = learner.id;
    }

    const terms = [
      { start: input.term1Start, end: input.term1End, sequence: 1 },
      { start: input.term2Start, end: input.term2End, sequence: 2 },
      { start: input.term3Start, end: input.term3End, sequence: 3 },
    ];

    const { data: existingTerms } = await client
      .from("academic_terms")
      .select("id")
      .eq("household_id", householdId)
      .order("start_date", { ascending: true });

    const routeIds = await routesForSubjects(client, input.subjects, input.elective);

    for (const [index, term] of terms.entries()) {
      const termRow = {
        household_id: householdId,
        name: `${input.seriesYear} - ${TERM_LABEL[term.sequence - 1]}`,
        start_date: term.start,
        end_date: term.end,
        midterm_exam_start: input.midtermWeek,
        final_exam_start: input.finalWeek,
        study_days: input.studyDays.split(",").filter(Boolean),
        daily_minutes_cap: input.dailyMinutesCap,
        status: term.sequence === 1 ? "active" : "upcoming",
      };

      const existing = existingTerms?.[index];
      let termId: string;

      if (existing) {
        const { error } = await client.from("academic_terms").update(termRow).eq("id", existing.id);
        if (error) throw new Error(error.message);
        termId = existing.id;
      } else {
        const { data: created, error } = await client
          .from("academic_terms")
          .insert(termRow)
          .select("id")
          .single<{ id: string }>();

        if (error || !created) throw new Error(error?.message ?? "Term was not created");
        termId = created.id;
      }

      if (routeIds.length === 0) continue;

      const { error: enrollmentError } = await client.from("learner_term_enrollments").upsert(
        routeIds.map((routeId, routeIndex) => ({
          student_id: learnerId,
          academic_term_id: termId,
          entry_route_id: routeId,
          is_elective: routeIndex === routeIds.length - 1 && Boolean(input.elective),
          weekly_allocated_minutes: input.dailyMinutesCap * Math.max(1, input.studyDays.split(",").length),
          target_grade: "A",
          target_exam_series: series,
        })),
        { onConflict: "student_id,academic_term_id,entry_route_id" },
      );

      if (enrollmentError) throw new Error(enrollmentError.message);
    }

    // The focus policy has to exist before a kiosk lock can be applied.
    // ignoreDuplicates keeps a policy the parent already tuned.
    await client
      .from("focus_policies")
      .upsert({ household_id: householdId, updated_by: guardianProfileId }, {
        onConflict: "household_id",
        ignoreDuplicates: true,
      });
  } catch (error) {
    if (createdHouseholdId) {
      await client.from("households").delete().eq("id", createdHouseholdId);
    }

    return { error: (error as Error).message, step: 4 };
  }

  await setGateCookie();

  redirect("/parent");
}

function zoneFor(countryCode: string) {
  const zones: Record<string, number> = {
    GB: 1,
    IE: 1,
    AE: 2,
    CY: 2,
    DE: 2,
    EG: 2,
    ES: 2,
    GR: 2,
    IT: 2,
    KE: 3,
    NG: 3,
    ZA: 3,
    TZ: 3,
    UG: 3,
    ZM: 3,
    ZW: 3,
    IN: 4,
    PK: 4,
    SG: 4,
    MY: 4,
    HK: 4,
    CN: 4,
    AU: 5,
    NZ: 5,
    CA: 6,
    US: 6,
    BR: 6,
    MX: 6,
  };
  return zones[countryCode.toUpperCase()] ?? 3;
}

/** Finds the private-candidate route for each chosen subject. */
async function routesForSubjects(client: ReturnType<typeof createAdminClient>, subjects: string, elective: string) {
  const codes = [...subjects.split(","), elective].map((code) => code.trim()).filter(Boolean);
  if (codes.length === 0) return [];

  const { data: subjectRows } = await client.from("subjects").select("id, subject_code").in("subject_code", codes);
  if (!subjectRows?.length) return [];

  const subjectIds = subjectRows.map((row) => row.id as string);
  const { data: versions } = await client.from("syllabus_versions").select("id").in("subject_id", subjectIds);
  if (!versions?.length) return [];

  const { data: routes } = await client
    .from("entry_routes")
    .select("id, syllabus_version_id")
    .in(
      "syllabus_version_id",
      versions.map((row) => row.id as string),
    )
    .eq("private_candidate_eligible", true);

  return (routes ?? []).map((route) => route.id as string);
}

/**
 * Rotates the guardian PIN. The caller must either hold an authenticated
 * guardian session or prove the current PIN, which the settings screen checks
 * before calling this.
 */
export async function setGuardianPin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "PIN must be 4 to 6 digits." };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Supabase is not configured." };

  const household = await resolveHousehold().catch(() => null);
  if (!household) return { ok: false, error: "No household has been set up yet." };

  const client = createAdminClient();
  const { error } = await client
    .from("households")
    .update({ guardian_pin_hash: hashPin(pin) })
    .eq("id", household.householdId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Re-checks a PIN without writing an attempt log; used to authorise a rotation. */
export async function currentPinMatches(pin: string) {
  const household = await resolveHousehold().catch(() => null);
  return pinMatches(pin, household?.householdId ?? null);
}
