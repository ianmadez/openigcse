import Link from "next/link";
import { ArrowLeft, ShieldCheck, Smartphone } from "lucide-react";

import { revokeDeviceAction } from "@/app/(parent)/parent/(gated)/settings/actions";
import {
  HouseholdDataForms,
  HouseholdRegionForm,
  LearnerProfileForm,
  PairingCodePanel,
  PinRotationForm,
} from "@/components/parent/SettingsForms";
import { Callout, EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/Button";
import { QuietHoursForm } from "@/components/parent/QuietHoursForm";
import { getHouseholdSettings } from "@/lib/data/household";
import { getQuietHours } from "@/lib/data/notifications";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ParentSettingsPage() {
  const [settings, state] = await Promise.all([getHouseholdSettings(), getSetupState()]);
  const quiet = state.status === "configured" ? await getQuietHours(state.householdId) : { start: null, end: null };

  return (
    <>
      <Link href="/parent" className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-secondary">
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
        Parent area
      </Link>

      <PageHeading eyebrow="Household" title="Settings">
        The learner's identity, the region the entry is filed under, the guardian PIN and the devices allowed to study
        at all.
      </PageHeading>

      {!settings ? (
        <Callout tone="warning" title="No household yet">
          Finish{" "}
          <Link href="/parent/onboarding" className="font-semibold underline">
            onboarding
          </Link>{" "}
          to create the household, then come back here.
        </Callout>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Learner profile" description="Who is studying, and which series the entry targets.">
            {settings.learner ? (
              <LearnerProfileForm
                displayName={settings.learner.displayName}
                yearGroup={settings.learner.yearGroup}
                candidateType={settings.learner.candidateType}
                targetExamSeries={settings.learner.targetExamSeries}
              />
            ) : (
              <EmptyState title="No learner in this household">
                Run onboarding once to create the learner profile.
              </EmptyState>
            )}
          </Panel>

          <Panel
            title="Household region"
            description="Drives the paper variant and the start of a study day."
            action={
              settings.focusPolicy?.isLocked ? (
                <Status tone="warning">Focus locked</Status>
              ) : (
                <Status tone="neutral">Focus open</Status>
              )
            }
          >
            <HouseholdRegionForm
              countryCode={settings.countryCode}
              zone={settings.zone}
              timezone={settings.timezone}
            />
          </Panel>

          <Panel
            title="Guardian PIN"
            description="Unlocks this parent area on the household's own devices."
            action={<ShieldCheck aria-hidden="true" className="size-4 text-accent-text" strokeWidth={2} />}
          >
            <PinRotationForm hasPin={settings.hasPin} />
          </Panel>

          <Panel
            title="Student devices"
            description="A paired device holds its own session; revoking it signs the learner out immediately."
            action={<Smartphone aria-hidden="true" className="size-4 text-accent-text" strokeWidth={2} />}
          >
            <PairingCodePanel />

            <div className="mt-5 border-t border-subtle pt-4">
              <p className="label mb-2">Paired devices</p>

              {settings.devices.length === 0 ? (
                <p className="text-caption text-muted">No device has been paired yet.</p>
              ) : (
                <ul className="divide-y divide-subtle">
                  {settings.devices.map((device) => {
                    const pending = !device.pairedAt && !device.revokedAt;
                    const state = device.revokedAt ? "revoked" : pending ? "pending" : "active";

                    return (
                      <li key={device.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-[0.875rem] text-primary">{device.name}</p>
                          <p className="text-caption text-muted">
                            {device.type}
                            {device.pairedAt
                              ? ` - paired ${dateFormat.format(new Date(device.pairedAt))}`
                              : pending
                                ? " - waiting for its code"
                                : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Status
                            tone={state === "active" ? "success" : state === "pending" ? "info" : "danger"}
                          >
                            {state === "active" ? "Paired" : state === "pending" ? "Code open" : "Revoked"}
                          </Status>

                          {!device.revokedAt && (
                            <form action={revokeDeviceAction}>
                              <input type="hidden" name="deviceId" value={device.id} />
                              <SubmitButton variant="secondary">Revoke</SubmitButton>
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Panel>

          <Panel
            title="Quiet hours"
            description="Push notifications wait outside this window, in the household's time zone. The bell in the top bar still lists everything."
          >
            <QuietHoursForm start={quiet.start} end={quiet.end} />
          </Panel>

          <Panel
            title="Household data"
            description="Take a copy of everything this household has stored, or delete the household and every account in it."
          >
            <HouseholdDataForms />
          </Panel>
        </div>
      )}
    </>
  );
}
