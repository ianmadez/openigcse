"use client";

import { KeyRound, Link2, RotateCcw, Save, TabletSmartphone } from "lucide-react";
import { useActionState } from "react";

import {
  generatePairingCodeAction,
  rotateGuardianPinAction,
  updateLearnerAction,
  updateRegionAction,
  type PairingState,
  type SettingsState,
} from "@/app/(parent)/parent/(gated)/settings/actions";
import { ActionButton } from "@/components/ui/Button";
import { keepInput, useResetOnSuccess } from "@/lib/utils/keepInput";
import {
  candidateTypes,
  examSeriesMonths,
  examSeriesYears,
  fallbackTimezones,
  regions,
  stages,
} from "@/lib/config/site";

const series = examSeriesMonths.flatMap((month) => examSeriesYears.map((year) => `${month} ${year}`));

const inputClass =
  "touch-target mt-1.5 w-full rounded-lg border border-strong bg-card px-3 py-2 text-[0.9375rem] text-primary focus:border-accent focus:outline-none";

function Feedback({ state }: { state: SettingsState }) {
  const message = state?.error ?? state?.message;
  const tone = state?.error ? "text-danger-text" : "text-success-text";

  return (
    <p role="status" aria-live="polite" className={message ? `text-caption ${tone}` : "invisible text-caption"}>
      {message ?? "placeholder"}
    </p>
  );
}

export function LearnerProfileForm({
  displayName,
  yearGroup,
  candidateType,
  targetExamSeries,
}: {
  displayName: string;
  yearGroup: string | null;
  candidateType: string | null;
  targetExamSeries: string | null;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(updateLearnerAction, null);
  const currentStage = yearGroup ?? stages[0];

  return (
    <form onSubmit={keepInput(formAction)} className="space-y-3">
      <div>
        <label htmlFor="learner-name" className="label">
          Display name
        </label>
        <input id="learner-name" name="displayName" defaultValue={displayName} required className={inputClass} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="learner-stage" className="label">
            Year group
          </label>
          <select id="learner-stage" name="yearGroup" defaultValue={currentStage} className={inputClass}>
            {[currentStage, ...stages.filter((stage) => stage !== currentStage)].map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="learner-candidate" className="label">
            Candidate type
          </label>
          <select
            id="learner-candidate"
            name="candidateType"
            defaultValue={candidateType ?? candidateTypes[0]}
            className={inputClass}
          >
            {candidateTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="learner-series" className="label">
          Target exam series
        </label>
        <select
          id="learner-series"
          name="targetExamSeries"
          defaultValue={targetExamSeries ?? series[0]}
          className={inputClass}
        >
          {targetExamSeries && !series.includes(targetExamSeries) && (
            <option value={targetExamSeries}>{targetExamSeries}</option>
          )}
          {series.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <ActionButton
        pending={pending}
        pendingLabel="Saving"
        icon={<Save aria-hidden="true" className="size-4" strokeWidth={2} />}
      >
        Save learner
      </ActionButton>

      <Feedback state={state} />
    </form>
  );
}

export function HouseholdRegionForm({
  countryCode,
  zone,
  timezone,
}: {
  countryCode: string;
  zone: number;
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(updateRegionAction, null);
  const timezones = Array.from(new Set([timezone, ...fallbackTimezones])).sort();

  return (
    <form onSubmit={keepInput(formAction)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="region-country" className="label">
            Country
          </label>
          <select id="region-country" name="countryCode" defaultValue={countryCode} className={inputClass}>
            {regions.map((region) => (
              <option key={region.code} value={region.code}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="region-zone" className="label">
            Cambridge zone
          </label>
          <select id="region-zone" name="zone" defaultValue={String(zone)} className={inputClass}>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                Zone {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="region-timezone" className="label">
          Timezone
        </label>
        <select id="region-timezone" name="timezone" defaultValue={timezone} className={inputClass}>
          {timezones.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <p className="text-caption text-muted">
        The zone decides the paper variant suffix; the timezone decides when a study day starts and ends.
      </p>

      <ActionButton
        pending={pending}
        pendingLabel="Saving"
        icon={<Save aria-hidden="true" className="size-4" strokeWidth={2} />}
      >
        Save household
      </ActionButton>

      <Feedback state={state} />
    </form>
  );
}

export function PinRotationForm({ hasPin }: { hasPin: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(rotateGuardianPinAction, null);
  const form = useResetOnSuccess(state, Boolean(state?.message && !state.error));

  return (
    <form ref={form} onSubmit={keepInput(formAction)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pin-current" className="label">
            Current PIN
          </label>
          <input
            id="pin-current"
            name="currentPin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={6}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="pin-new" className="label">
            New PIN
          </label>
          <input
            id="pin-new"
            name="newPin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={6}
            className={inputClass}
          />
        </div>
      </div>

      <p className="text-caption text-muted">
        {hasPin
          ? "Four to six digits. Five wrong attempts in ten minutes locks the parent area for ten minutes."
          : "This household has no stored PIN yet; the development PIN from PARENT_MASTER_PIN still works."}
      </p>

      <ActionButton
        pending={pending}
        pendingLabel="Rotating"
        variant="secondary"
        icon={<KeyRound aria-hidden="true" className="size-4" strokeWidth={2} />}
      >
        Rotate PIN
      </ActionButton>

      <Feedback state={state} />
    </form>
  );
}

const DEVICE_TYPES = [
  { value: "windows", label: "Windows laptop" },
  { value: "ipad", label: "iPad" },
  { value: "android", label: "Android tablet" },
  { value: "chromebook", label: "Chromebook" },
  { value: "web", label: "Browser" },
] as const;

export function PairingCodePanel() {
  const [state, formAction, pending] = useActionState<PairingState, FormData>(generatePairingCodeAction, null);

  return (
    <div className="space-y-4">
      <form onSubmit={keepInput(formAction)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="device-name" className="label">
              Device name
            </label>
            <input
              id="device-name"
              name="deviceName"
              required
              maxLength={60}
              placeholder="Learner laptop"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="device-type" className="label">
              Device type
            </label>
            <select id="device-type" name="deviceType" defaultValue="windows" className={inputClass}>
              {DEVICE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ActionButton
          pending={pending}
          pendingLabel="Generating"
          icon={<Link2 aria-hidden="true" className="size-4" strokeWidth={2} />}
        >
          Generate pairing code
        </ActionButton>
      </form>

      {state?.code && (
        <div className="rounded-panel border border-accent-line bg-accent-soft p-4">
          <p className="flex items-center gap-1.5 text-caption font-medium text-accent-text">
            <TabletSmartphone aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {state.deviceName}
          </p>
          <p className="mt-1 font-mono text-3xl tracking-[0.3em] text-primary tabular">{state.code}</p>
          <p className="mt-1 text-caption text-secondary">
            Enter this on the learner's device at{" "}
            <span className="font-medium text-primary">/pair</span>. It works once and expires at{" "}
            {state.expiresAt
              ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(
                  new Date(state.expiresAt),
                )
              : "the end of the window"}
            .
          </p>
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        className={state?.error ? "text-caption text-danger-text" : "invisible text-caption"}
      >
        {state?.error ?? "placeholder"}
      </p>

      <p className="flex items-start gap-1.5 text-caption text-muted">
        <RotateCcw aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
        Pairing a new device revokes the previous one, so a learner only ever has one active device.
      </p>
    </div>
  );
}
