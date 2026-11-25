import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { MessageThread } from "@/components/live/MessageThread";
import { PageHeading } from "@/components/ui/primitives";
import { getAuthContext } from "@/lib/auth/session";
import { displayNameOf, getThread } from "@/lib/data/messages";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Messages" };

export default async function ParentMessagesPage() {
  const [state, context] = await Promise.all([getSetupState(), getAuthContext()]);

  if (state.status !== "configured" || !context?.profileId || context.role === "student") {
    return (
      <>
        <PageHeading eyebrow="Messages" title="Messages">
          Sign in with the guardian account to read and send messages.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const [name, thread] = await Promise.all([displayNameOf(context.profileId), getThread(state.householdId)]);

  return (
    <>
      <PageHeading eyebrow="Messages" title={`Thread with ${state.learnerName}`}>
        One thread for the household. Requests with a decision stay on the overview and the live screen.
      </PageHeading>
      <MessageThread
        householdId={state.householdId}
        profileId={context.profileId}
        profileName={name ?? "Parent"}
        initial={thread}
      />
    </>
  );
}
