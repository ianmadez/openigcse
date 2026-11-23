"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hashPairingCode } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClientInstance } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | null;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(72),
});

async function origin() {
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  const proto = store.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");

  return `${proto}://${host}`;
}

/** Guardian sign-in with email and password. */
export async function signInWithPasswordAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };

  const supabase = await createServerClientInstance();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "That email and password do not match an account."
          : error.message,
    };
  }

  redirect("/parent");
}

/** Email magic link. The link lands on /auth/callback, which sets the session. */
export async function sendMagicLinkAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));

  if (!email.success) return { error: "Enter a valid email address." };

  const supabase = await createServerClientInstance();
  const base = await origin();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${base}/auth/callback?next=/parent` },
  });

  if (error) return { error: error.message };

  return { message: "Check your inbox. The link signs you in on this device and expires shortly." };
}

export async function signOutAction() {
  const supabase = await createServerClientInstance();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Redeems a six-digit pairing code on the student device.
 *
 * The device gets its own Supabase auth user, which is bound to both the device
 * row and the learner profile. That is what makes Postgres RLS resolve
 * `current_household_id()` for the student: the JWT is real, not a cookie flag.
 * Pairing a second device moves the profile link and revokes the previous one.
 */
export async function redeemPairingCodeAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");

  if (!/^\d{6}$/.test(code)) return { error: "Enter the six-digit code from the parent device." };

  const admin = createAdminClient();
  const { data: device, error: lookupError } = await admin
    .from("devices")
    .select("id, household_id, student_id, device_name, pairing_code_expires_at, revoked_at, paired_at")
    .eq("pairing_code_hash", hashPairingCode(code))
    .is("revoked_at", null)
    .is("paired_at", null)
    .gt("pairing_code_expires_at", new Date().toISOString())
    .maybeSingle<{
      id: string;
      household_id: string;
      student_id: string;
      device_name: string;
      pairing_code_expires_at: string;
    }>();

  if (lookupError) return { error: lookupError.message };
  if (!device) return { error: "That code has expired or is not valid. Ask the parent for a new one." };

  const email = `device-${device.id}@devices.openigcse.app`;
  const password = randomBytes(24).toString("base64url");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "student_device",
      device_id: device.id,
      household_id: device.household_id,
      student_id: device.student_id,
    },
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "The device account could not be created." };
  }

  const now = new Date().toISOString();

  // One paired device per learner: the profile's auth link can only point at
  // one user, so older devices are cut off rather than left half-working.
  await admin
    .from("devices")
    .update({ revoked_at: now })
    .eq("student_id", device.student_id)
    .neq("id", device.id)
    .is("revoked_at", null);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ auth_user_id: created.user.id })
    .eq("id", device.student_id);

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message };
  }

  const { error: deviceError } = await admin
    .from("devices")
    .update({
      auth_user_id: created.user.id,
      paired_at: now,
      last_seen_at: now,
      pairing_code_hash: null,
      pairing_code_expires_at: null,
      visibility_state: "visible",
    })
    .eq("id", device.id);

  if (deviceError) return { error: deviceError.message };

  const supabase = await createServerClientInstance();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) return { error: signInError.message };

  redirect("/today");
}
