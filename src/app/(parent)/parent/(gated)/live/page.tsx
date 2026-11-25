import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { LiveMonitor } from "@/components/live/LiveMonitor";
import { RequestQueue } from "@/components/live/RequestQueue";
import { PageHeading, Panel } from "@/components/ui/primitives";
import { todayIso } from "@/lib/data/dates";
import { getFocusPolicy } from "@/lib/data/focus";
import { getLiveSession } from "@/lib/data/live";
import { getLearnerRequestState, getRequests } from "@/lib/data/requests";
import { getSetupState } from "@/lib/data/session";
import { dayOfWeekFor, getDayPlanItems, getTimetableSlots } from "@/lib/data/timetable";
import { currentPeriodOf, localMinutes } from "@/lib/live/presence";

export const dynamic = "force-dynamic";

export const metadata = { title: "Live" };

export default async function LivePage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Live" title="Right now">
          What is happening on the study device, and what you can change from here.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const today = todayIso(new Date(), state.timezone);
  const [session, items, slots, focus, requests, learnerRequests] = await Promise.all([
    getLiveSession(state.learnerId, today),
    getDayPlanItems(state.learnerId, today),
    state.activeTermId ? getTimetableSlots(state.activeTermId) : Promise.resolve([]),
    getFocusPolicy(state.householdId),
    getRequests(state.householdId, 10),
    getLearnerRequestState(state.learnerId),
  ]);

  const period = currentPeriodOf(
    slots.filter((slot) => slot.dayOfWeek === dayOfWeekFor(today)),
    localMinutes(new Date(), state.timezone),
  );
  const current =
    items.find((item) => item.id === session?.currentItemId) ?? items.find((item) => item.status === "in_progress") ?? null;
  const study = items.filter((item) => item.itemType !== "break");

  return (
    <>
      <PageHeading eyebrow="Live" title="Right now">
        The study device reports every 30 seconds. Answers and remote actions reach it within a few seconds.
      </PageHeading>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <LiveMonitor
          view={{
            householdId: state.householdId,
            learnerId: state.learnerId,
            learnerName: state.learnerName,
            session,
            periodLabel: period ? `${period.title ?? period.subjectName ?? "Period"}, ${period.startTime.slice(0, 5)}-${period.endTime.slice(0, 5)}` : null,
            currentTask: current ? (current.subjectName ? `${current.subjectName}: ${current.title}` : current.title) : null,
            doneMinutes: study.filter((item) => item.status === "done").reduce((sum, item) => sum + item.actualMinutes, 0),
            plannedMinutes: study.reduce((sum, item) => sum + item.plannedMinutes, 0),
            focus: focus ? { isLocked: focus.isLocked, lockEndsAt: focus.lockEndsAt } : null,
            breakSecondsLeft: learnerRequests.breakSecondsLeft,
          }}
        />
        <Panel title="Requests" className="self-start">
          <RequestQueue householdId={state.householdId} requests={requests} />
        </Panel>
      </div>
    </>
  );
}
