import { redirect } from "next/navigation";

import { demoMode, getSetupState, onboardingBypass } from "@/lib/data/session";

export default async function IndexPage() {
  const state = await getSetupState();

  if (state.status === "configured") redirect("/today");
  if (state.status === "signed-out" && !demoMode()) redirect("/login");
  if (!onboardingBypass()) redirect("/parent/onboarding");

  redirect("/today");
}
