import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell, type NavSubject } from "@/components/shell/AppShell";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { demoMode, getSetupState, onboardingBypass } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const state = await getSetupState();

  if (state.status === "signed-out" && !demoMode()) redirect("/pair");
  if (state.status === "unconfigured" && !onboardingBypass() && !demoMode()) redirect("/parent/onboarding");

  const curriculum =
    state.status === "configured" && state.activeTermId
      ? await getEnrolledCurriculum(state.learnerId, state.activeTermId)
      : [];

  const subjects: NavSubject[] = curriculum.map((subject) => ({
    code: subject.subjectCode,
    name: subject.subjectName,
    slug: subject.slug,
    topics: subject.topics.map((topic) => ({ code: topic.code, name: topic.name })),
  }));

  const learnerName = state.status === "configured" ? state.learnerName : "Learner";

  return (
    <AppShell variant="student" learnerName={learnerName} subjects={subjects}>
      {children}
    </AppShell>
  );
}
