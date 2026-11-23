import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { FocusControls } from "@/components/parent/FocusControls";
import { Callout, EmptyState, PageHeading, Panel } from "@/components/ui/primitives";
import { isoDate } from "@/lib/data/dates";
import { getLearningEvents } from "@/lib/data/events";
import { getFocusPolicy } from "@/lib/data/focus";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Focus" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function FocusPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Focus" title="Session limits">
          These settings decide when the learner can study and what the app records while they do.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const [events, policy] = await Promise.all([
    getLearningEvents(state.learnerId, isoDate(-14)),
    getFocusPolicy(state.householdId),
  ]);

  return (
    <>
      <PageHeading eyebrow="Focus" title="Session limits">
        These settings decide when the learner can study and what the app records while they do.
      </PageHeading>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <FocusControls />

        <div className="space-y-4">
          <Panel title="Recent sessions" description="Minutes recorded from the study timer.">
            {events.length === 0 ? (
              <EmptyState title="No sessions recorded">
                A study timer that runs publishes an event here with its minutes and objective.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-subtle">
                {events.slice(0, 8).map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] text-secondary">
                        {event.objectiveCode ?? "Unassigned"}
                      </span>
                      <span className="block text-caption text-muted">
                        {event.kind} - {dateFormat.format(new Date(event.at))}
                      </span>
                    </span>
                    <span className="text-caption text-muted tabular">{event.minutes} min</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Policy on file" description="The row the kiosk shell will read.">
            {policy ? (
              <p className="text-caption leading-relaxed text-secondary">
                {policy.isLocked ? "Locked" : "Open"} with {policy.allowedRoutes.length} allowed route
                {policy.allowedRoutes.length === 1 ? "" : "s"}
                {policy.updatedAt ? `, last changed ${dateFormat.format(new Date(policy.updatedAt))}.` : "."}
              </p>
            ) : (
              <p className="text-caption text-secondary">
                No policy row yet. Onboarding creates one; the controls above are a browser draft until the kiosk shell
                reads and writes this table.
              </p>
            )}
          </Panel>

          <Callout tone="info" title="Where the lock is enforced">
            The PIN gate and session log run in the web app. Blocking the browser chrome needs the Tauri kiosk shell,
            which reads the same settings from the device store.
          </Callout>
        </div>
      </div>
    </>
  );
}
