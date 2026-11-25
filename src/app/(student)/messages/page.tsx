import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { MessageThread } from "@/components/live/MessageThread";
import { PageHeading } from "@/components/ui/primitives";
import { getThread } from "@/lib/data/messages";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const state = await getSetupState();

  if (state.status !== "configured" || state.role !== "student") {
    return (
      <>
        <PageHeading eyebrow="Messages" title="Messages">
          The household thread lives on the learner&apos;s own signed-in device.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  return (
    <>
      <PageHeading eyebrow="Messages" title="Talk to home">
        Text, a photo of your working, or a voice note. For a yes-or-no ask, use the Ask button instead so it gets a
        one-tap answer.
      </PageHeading>
      <MessageThread
        householdId={state.householdId}
        profileId={state.learnerId}
        profileName={state.learnerName}
        initial={await getThread(state.householdId)}
      />
    </>
  );
}
