import type { ReactNode } from "react";

import { ParentDock } from "@/components/live/ParentDock";
import { AppShell } from "@/components/shell/AppShell";
import { getAuthContext } from "@/lib/auth/session";
import { unreadMessageCount } from "@/lib/data/messages";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  // Both resolve the same cached sign-in, so they run side by side.
  const [state, context] = await Promise.all([getSetupState(), getAuthContext()]);

  const label =
    state.status === "configured"
      ? state.learnerName
      : (state.status === "unconfigured" && state.householdName) || "No household";

  const dock =
    state.status === "configured" && context?.profileId && context.role !== "student" ? (
      <ParentDock
        profileId={context.profileId}
        householdId={state.householdId}
        unreadMessages={await unreadMessageCount(state.householdId, context.profileId)}
      />
    ) : null;

  return (
    <AppShell variant="parent" learnerName={label} headerSlot={dock}>
      {children}
    </AppShell>
  );
}
