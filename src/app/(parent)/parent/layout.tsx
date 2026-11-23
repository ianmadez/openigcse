import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const state = await getSetupState();

  const label =
    state.status === "configured"
      ? state.learnerName
      : (state.status === "unconfigured" && state.householdName) || "No household";

  return (
    <AppShell variant="parent" learnerName={label}>
      {children}
    </AppShell>
  );
}
