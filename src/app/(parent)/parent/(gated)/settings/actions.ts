"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { currentPinMatches, setGuardianPin } from "@/app/(parent)/parent/actions";
import { authorizeGuardian } from "@/lib/auth/guard";
import { generatePairingCode, getAuthContext, hashPairingCode } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type SettingsState = { error?: string; message?: string } | null;
export type PairingState = { error?: string; code?: string; expiresAt?: string; deviceName?: string } | null;

const SETTINGS_PATH = "/parent/settings";

async function learnerIdFor(householdId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId)
    .eq("role", "student")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

const learnerSchema = z.object({
  displayName: z.string().trim().min(1, "Enter the learner's name.").max(60),
  yearGroup: z.string().trim().min(2, "Choose a year group.").max(40),
  candidateType: z.enum(["Private Candidate", "School Candidate"]),
  targetExamSeries: z.string().trim().min(4, "Choose the exam series.").max(24),
});

export async function updateLearnerAction(_previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const active = await authorizeGuardian();
  if (!active) return { error: "Unlock the parent area before changing the learner." };

  const parsed = learnerSchema.safeParse({
    displayName: formData.get("displayName"),
    yearGroup: formData.get("yearGroup"),
    candidateType: formData.get("candidateType"),
    targetExamSeries: formData.get("targetExamSeries"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the learner details." };

  const learnerId = await learnerIdFor(active.householdId);
  if (!learnerId) return { error: "This household has no learner profile yet. Finish onboarding first." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      year_group: parsed.data.yearGroup,
      candidate_type: parsed.data.candidateType,
      target_exam_series: parsed.data.targetExamSeries,
    })
    .eq("id", learnerId);

  if (error) return { error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { message: "Learner profile saved." };
}

const regionSchema = z.object({
  countryCode: z.string().trim().length(2, "Pick a country."),
  zone: z.coerce.number().int().min(1).max(6),
  timezone: z.string().trim().min(3).max(64),
});

export async function updateRegionAction(_previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const active = await authorizeGuardian();
  if (!active) return { error: "Unlock the parent area before changing the household." };

  const parsed = regionSchema.safeParse({
    countryCode: formData.get("countryCode"),
    zone: formData.get("zone"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the household details." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("households")
    .update({
      country_code: parsed.data.countryCode.toUpperCase(),
      cambridge_admin_zone: parsed.data.zone,
      timezone: parsed.data.timezone,
    })
    .eq("id", active.householdId);

  if (error) return { error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { message: "Household region saved." };
}

const pinRotationSchema = z.object({
  currentPin: z.string().regex(/^\d{4,6}$/, "Enter your current 4 to 6 digit PIN."),
  newPin: z.string().regex(/^\d{4,6}$/, "The new PIN must be 4 to 6 digits."),
});

export async function rotateGuardianPinAction(_previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const active = await authorizeGuardian();
  if (!active) return { error: "Unlock the parent area before rotating the PIN." };

  const parsed = pinRotationSchema.safeParse({
    currentPin: formData.get("currentPin"),
    newPin: formData.get("newPin"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the PINs." };
  if (parsed.data.currentPin === parsed.data.newPin) return { error: "Choose a PIN that is different from the old one." };

  if (!(await currentPinMatches(parsed.data.currentPin))) {
    return { error: "That is not the current PIN." };
  }

  const result = await setGuardianPin(parsed.data.newPin);
  if (!result.ok) return { error: result.error };

  revalidatePath(SETTINGS_PATH);
  return { message: "Guardian PIN rotated. Use the new PIN next time the parent area locks." };
}

const pairingSchema = z.object({
  deviceName: z.string().trim().min(1, "Name the device so you can recognise it later.").max(60),
  deviceType: z.enum(["windows", "ipad", "android", "chromebook", "web"]),
});

/** Issues a single-use six-digit code, stored only as a hash. */
export async function generatePairingCodeAction(
  _previous: PairingState,
  formData: FormData,
): Promise<PairingState> {
  const active = await authorizeGuardian();
  if (!active) return { error: "Unlock the parent area before pairing a device." };

  const parsed = pairingSchema.safeParse({
    deviceName: formData.get("deviceName"),
    deviceType: formData.get("deviceType"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the device details." };

  const studentId = await learnerIdFor(active.householdId);
  if (!studentId) return { error: "This household has no learner profile yet. Finish onboarding first." };

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  const { error } = await admin.from("devices").insert({
    household_id: active.householdId,
    student_id: studentId,
    device_name: parsed.data.deviceName,
    device_type: parsed.data.deviceType,
    pairing_code_hash: hashPairingCode(code),
    pairing_code_expires_at: expiresAt,
    created_by: active.profileId,
  });

  if (error) return { error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { code, expiresAt, deviceName: parsed.data.deviceName };
}

/** Cuts a device off. Middleware drops its session on the very next request. */
export async function revokeDeviceAction(formData: FormData) {
  const active = await authorizeGuardian();
  if (!active) return;

  const deviceId = z.string().uuid().safeParse(formData.get("deviceId"));
  if (!deviceId.success) return;

  const admin = createAdminClient();
  await admin
    .from("devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", deviceId.data)
    .eq("household_id", active.householdId)
    .is("revoked_at", null);

  revalidatePath(SETTINGS_PATH);
}
