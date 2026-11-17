import Link from "next/link";
import { ArrowLeft, Link2, LogOut } from "lucide-react";

import { linkExistingHouseholdAction, signOutGuardianAction } from "@/app/(parent)/parent/onboarding/actions";
import { OnboardingAccountGate } from "@/components/auth/OnboardingAccountGate";
import { OnboardingWizard } from "@/components/parent/OnboardingWizard";
import { Callout, PageHeading, Panel } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/Button";
import { getAuthContext } from "@/lib/auth/session";
import { getAvailableSubjects } from "@/lib/data/curriculum";
import { listLinkableProfiles } from "@/lib/data/household";
import { getSetupState, onboardingBypass } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set up your household" };

export default async function OnboardingPage() {
  const bypass = onboardingBypass();
  const state = await getSetupState();
  const account = await getAuthContext().catch(() => null);
  const guardian = account && account.role !== "student" ? account : null;

  const available = guardian ? await getAvailableSubjects() : [];
  const linkable = guardian && !guardian.householdId ? await listLinkableProfiles() : null;
  const toOption = (subject: (typeof available)[number]) => ({
    code: subject.code,
    name: subject.name,
    elective: subject.isElective,
    papers: subject.papers,
    hasRoute: subject.hasPrivateRoute,
  });

  const core = available.filter((subject) => !subject.isElective).map(toOption);
  const electives = available.filter((subject) => subject.isElective).map(toOption);

  return (
    <>
      <Link href="/parent" className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-secondary">
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
        Parent area
      </Link>

      <PageHeading eyebrow="First run" title="Set up your household">
        Four short steps: who you are, who is studying, when the terms run, and which papers are being entered. You can
        leave and come back; nothing is locked until you finish.
      </PageHeading>

      {account?.role === "student" ? (
        <Callout tone="warning" title="This device is paired as a learner">
          Onboarding has to run on a guardian device.{" "}
          <Link href="/login" className="font-semibold underline">
            Sign in as the guardian
          </Link>{" "}
          to change the household.
        </Callout>
      ) : !guardian ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <OnboardingAccountGate />

          <Callout tone="info" title="Why an account first">
            The household, the learner and the terms belong to a real Supabase Auth user. That is what lets the
            database enforce one household per family instead of trusting whichever device asks.
          </Callout>
        </div>
      ) : linkable ? (
        <Panel
          title={`${linkable.householdName} is already on this database`}
          description="These adults have no sign-in yet, which is how profiles created before sign-in worked. Pick the one that is you."
        >
          <ul className="divide-y divide-subtle">
            {linkable.members.map((member) => (
              <li key={member.profileId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block text-[0.875rem] text-primary">{member.name}</span>
                  <span className="block text-caption text-muted">
                    {member.relationship ?? "Guardian"}
                    {member.role === "developer_admin" ? " - developer" : ""}
                  </span>
                </span>

                <form action={linkExistingHouseholdAction}>
                  <input type="hidden" name="profileId" value={member.profileId} />
                  <SubmitButton
                    variant="secondary"
                    pendingLabel="Linking"
                    icon={<Link2 aria-hidden="true" className="size-4" strokeWidth={2} />}
                  >
                    This is me
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-caption text-muted">
            Linking keeps the existing learner, terms and enrolments instead of creating a second household. Starting a
            new household instead means finishing the wizard below, but that leaves two households in the database.
          </p>
        </Panel>
      ) : (
        <>
          {state.status === "configured" && guardian.householdId && (
            <div className="mb-5">
              <Callout tone="info" title={`${state.householdName} is already set up`}>
                Finishing this wizard again updates this household, the learner and the three terms in place. Nothing
                is duplicated.
              </Callout>
            </div>
          )}

          {state.status === "configured" && !guardian.householdId && (
            <div className="mb-5">
              <Callout tone="warning" title={`${state.householdName} already exists on this device`}>
                This guardian account is not linked to it yet. Signing in with the account that created the household
                edits it; continuing here creates a second household.
              </Callout>
            </div>
          )}

          {bypass && state.status !== "configured" && (
            <div className="mb-5">
              <Callout tone="info" title="Onboarding is optional on this device">
                ONBOARDING_BYPASS is on, so the app opens straight into the demo workspace. Finish this wizard whenever
                you want the real household to replace it.
              </Callout>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-muted">
              Signed in as {guardian.role === "developer_admin" ? "developer" : "guardian"}
              {guardian.householdId ? " for this household" : " - no household yet"}.
            </p>

            <form action={signOutGuardianAction}>
              <SubmitButton variant="secondary" icon={<LogOut aria-hidden="true" className="size-4" strokeWidth={2} />}>
                Sign out
              </SubmitButton>
            </form>
          </div>

          <OnboardingWizard coreSubjects={core} electives={electives} bypass={bypass} />
        </>
      )}
    </>
  );
}
