import { notFound } from "next/navigation";

import { SittingRunner } from "@/components/student/SittingRunner";
import { Callout } from "@/components/ui/primitives";
import { requireLearnerSession } from "@/lib/auth/learner-session";
import { getSittingView } from "@/lib/data/sittings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function SittingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const learner = await requireLearnerSession();
  if (!learner.ok) {
    return (
      <div className="mx-auto max-w-xl">
        <Callout tone="warning" title="Open this on the learner's device">
          {learner.error}
        </Callout>
      </div>
    );
  }

  const view = await getSittingView(id, learner.learnerId);
  if (!view) notFound();

  return <SittingRunner key={`${view.state}-${view.sitting?.id ?? "new"}`} view={view} serverNow={new Date().toISOString()} learnerId={learner.learnerId} />;
}
