import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell, type NavSubject } from "@/components/shell/AppShell";
import { StudentDock } from "@/components/live/StudentDock";
import { OfflineWritesProvider } from "@/components/student/OfflineWrites";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { unreadMessageCount } from "@/lib/data/messages";
import { getLearnerRequestState } from "@/lib/data/requests";
import { demoMode, getSetupState, onboardingBypass } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const state = await getSetupState();

  if (state.status === "signed-out" && !demoMode()) redirect("/pair");
  if (state.status === "unconfigured" && !onboardingBypass() && !demoMode()) redirect("/parent/onboarding");

  // The sidebar's curriculum and the dock's counts are independent, so they load together.
  const isLearnerDevice = state.status === "configured" && state.role === "student";
  const [curriculum, dockData] = await Promise.all([
    state.status === "configured" && state.activeTermId ? getEnrolledCurriculum(state.learnerId, state.activeTermId) : [],
    isLearnerDevice
      ? Promise.all([unreadMessageCount(state.householdId, state.learnerId), getLearnerRequestState(state.learnerId)])
      : null,
  ]);

  const subjects: NavSubject[] = curriculum.map((subject) => ({
    code: subject.subjectCode,
    name: subject.subjectName,
    slug: subject.slug,
    topics: subject.topics.map((topic) => ({ code: topic.code, name: topic.name })),
  }));

  const learnerName = state.status === "configured" ? state.learnerName : "Learner";

  // The dock is for the learner's own device; a guardian previewing the student view gets none.
  const dock =
    state.status === "configured" && dockData ? (
      <StudentDock
        learnerId={state.learnerId}
        householdId={state.householdId}
        unreadMessages={dockData[0]}
        breakSecondsLeft={dockData[1].breakSecondsLeft}
      />
    ) : null;

  return (
    <AppShell variant="student" learnerName={learnerName} subjects={subjects} headerSlot={dock}>
      <OfflineWritesProvider>{children}</OfflineWritesProvider>
    </AppShell>
  );
}
