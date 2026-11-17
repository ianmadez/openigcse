import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

/**
 * Distraction-free: no navigation, sidebar or sounds while a paper is open.
 * The same sign-in rules as the learner area apply.
 */
export default async function SittingLayout({ children }: { children: ReactNode }) {
  const state = await getSetupState();
  if (state.status === "signed-out") redirect("/pair");
  if (state.status === "unconfigured") redirect("/parent/onboarding");

  return (
    <div className="min-h-dvh px-4 py-4 sm:px-6 sm:py-8">
      <nav aria-label="Leave the paper" className="mx-auto mb-3 max-w-3xl">
        <Link href="/assessments" className="text-caption text-secondary underline">
          All assessments
        </Link>
      </nav>
      <main>{children}</main>
    </div>
  );
}
