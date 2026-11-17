"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthUser } from "@/lib/auth/session";
import { listLinkableProfiles } from "@/lib/data/household";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClientInstance } from "@/lib/supabase/server";

export type AccountState = { error?: string; message?: string } | null;

const accountSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(72),
  mode: z.enum(["sign-in", "create"]),
});

async function origin() {
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  const proto = store.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");

  return `${proto}://${host}`;
}

/**
 * Step 0 of onboarding: a household belongs to a real auth user, so the
 * guardian signs in (or creates the account) before any row is written.
 */
export async function startGuardianSessionAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  if (await getAuthUser()) redirect("/parent/onboarding");

  const parsed = accountSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    mode: formData.get("mode") ?? "sign-in",
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };

  const supabase = await createServerClientInstance();
  const { email, password, mode } = parsed.data;

  if (mode === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return {
        error:
          error.message === "Invalid login credentials"
            ? "No account matches that email and password. Choose Create account if you are new here."
            : error.message,
      };
    }
  } else {
    const base = await origin();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${base}/auth/callback?next=/parent/onboarding` },
    });

    if (error) return { error: error.message };

    if (!data.session) {
      return { message: "Confirm the email we just sent, then reopen this page to finish onboarding." };
    }
  }

  redirect("/parent/onboarding");
}

/** Leaves the guardian account signed in but locks the parent area. */
export async function signOutGuardianAction() {
  const supabase = await createServerClientInstance();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Links the signed-in account to one of the household's unlinked profiles.
 *
 * Only runs from an explicit click, and only for a profile that is genuinely
 * unlinked, so it can never silently adopt someone else's row.
 */
export async function linkExistingHouseholdAction(formData: FormData) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const profileId = String(formData.get("profileId") ?? "");
  const linkable = await listLinkableProfiles();
  const member = linkable?.members.find((entry) => entry.profileId === profileId);

  if (!member) redirect("/parent/onboarding");

  const admin = createAdminClient();
  await admin.from("profiles").update({ auth_user_id: user.id }).eq("id", member.profileId).is("auth_user_id", null);

  redirect("/parent");
}
