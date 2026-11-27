"use client";

import { ArrowLeft, ArrowRight, Check, GraduationCap, Home, KeyRound, Sparkles } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";

import { completeOnboardingAction, type OnboardingState } from "@/app/(parent)/parent/actions";
import { Status } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/Button";
import {
  candidateTypes,
  examSeriesMonths,
  examSeriesYears,
  fallbackTimezones,
  guardianRelationships,
  regionByCode,
  regions,
  stages,
  studyDayOptions,
} from "@/lib/config/site";
import { cn } from "@/lib/utils/cn";
import { keepInput } from "@/lib/utils/keepInput";

type SubjectOption = { code: string; name: string; elective: boolean; papers: number; hasRoute: boolean };

type OnboardingWizardProps = {
  coreSubjects: SubjectOption[];
  electives: SubjectOption[];
  bypass: boolean;
};

const STEPS = ["Household", "Learner", "Calendar", "Subjects"] as const;

export function OnboardingWizard({ coreSubjects, electives, bypass }: OnboardingWizardProps) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(completeOnboardingAction, null);
  const [step, setStep] = useState(0);

  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [selectedCore, setSelectedCore] = useState<string[]>(coreSubjects.map((subject) => subject.code));
  const [elective, setElective] = useState(electives[0]?.code ?? "");
  const [studyDays, setStudyDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [pin, setPin] = useState("");

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const match = regions.find((region) => region.timezone === detected);
    setTimezone(detected || fallbackTimezones[0] || "UTC");
    if (match) setCountry(match.code);
  }, []);

  useEffect(() => {
    if (state?.step) setStep(Math.max(0, state.step - 1));
  }, [state]);

  const zone = regionByCode(country)?.zone ?? 3;
  const options = useMemo(() => [...coreSubjects, ...electives], [coreSubjects, electives]);
  const routePreview = useMemo(
    () =>
      [...selectedCore, elective].filter(Boolean).map((code) => {
        const option = options.find((item) => item.code === code);
        return { code, name: option?.name ?? code, papers: option?.papers ?? 0, hasRoute: option?.hasRoute ?? false };
      }),
    [elective, options, selectedCore],
  );

  const canContinue = step > 0 || (pin.length >= 4 && country !== "");

  return (
    <form
      className="space-y-5"
      // Only the last step submits; earlier steps' Enter key does nothing.
      onSubmit={keepInput(formAction, () => step === STEPS.length - 1)}
    >
      {/* Hidden fields carry the state the wizard collects. */}
      <input type="hidden" name="countryCode" value={country} />
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="studyDays" value={studyDays.join(",")} />
      <input type="hidden" name="subjects" value={selectedCore.join(",")} />
      <input type="hidden" name="elective" value={elective} />

      <ol className="flex flex-wrap gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "touch-target inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-medium",
                index === step
                  ? "border-accent-line bg-accent-soft text-accent-text"
                  : index < step
                    ? "border-success/40 bg-success-soft text-success-text"
                    : "border-subtle bg-card text-muted",
              )}
            >
              {index < step ? (
                <Check aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
              ) : (
                <span className="tabular">{index + 1}</span>
              )}
              {label}
            </button>
          </li>
        ))}
      </ol>

      {bypass && (
        <p className="rounded-panel border border-info/40 bg-info-soft px-3 py-2 text-caption text-info-text">
          This device already skips onboarding, so you can walk through this at your own pace. Finishing it replaces the
          demo learner with a real household.
        </p>
      )}

      <div className="surface p-5">
        <fieldset className="space-y-4" hidden={step !== 0}>
          <legend className="flex items-center gap-2 text-heading font-semibold text-primary">
            <Home aria-hidden="true" className="size-4 text-accent-text" strokeWidth={2} />
            Household and guardian
          </legend>

          <label className="block">
            <span className="label">Household name</span>
            <input name="householdName" defaultValue="Our household" className="field mt-1" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Country</span>
              <select value={country} onChange={(event) => setCountry(event.target.value)} className="field mt-1">
                <option value="">Choose a country</option>
                {regions.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.name} (zone {region.zone})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Timezone</span>
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                list="timezones"
                className="field mt-1"
              />
              <datalist id="timezones">
                {fallbackTimezones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </label>
          </div>

          <p className="text-caption text-muted">
            Cambridge administrative zone <span className="font-semibold text-primary">{zone}</span>. Paper variants for
            your entries follow this zone.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Your name</span>
              <input name="guardianName" defaultValue="Guardian" className="field mt-1" />
            </label>

            <label className="block">
              <span className="label">You are</span>
              <select name="relationship" className="field mt-1" defaultValue="Guardian">
                {guardianRelationships.map((relationship) => (
                  <option key={relationship} value={relationship}>
                    {relationship}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="label flex items-center gap-1.5">
              <KeyRound aria-hidden="true" className="size-3.5" strokeWidth={2} />
              Guardian PIN (4 to 6 digits)
            </span>
            <input
              name="pin"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              className="field mt-1 max-w-40 tracking-[0.4em]"
              placeholder="0000"
            />
            <span className="mt-1 block text-caption text-muted">
              Stored as a salted hash. It unlocks the parent area on this device.
            </span>
          </label>
        </fieldset>

        <fieldset className="space-y-4" hidden={step !== 1}>
          <legend className="flex items-center gap-2 text-heading font-semibold text-primary">
            <GraduationCap aria-hidden="true" className="size-4 text-accent-text" strokeWidth={2} />
            Learner
          </legend>

          <label className="block">
            <span className="label">Display name</span>
            <input name="learnerName" defaultValue="Learner" className="field mt-1" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Stage</span>
              <select name="stage" className="field mt-1" defaultValue="Lower Secondary Stage 8">
                {stages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Candidate type</span>
              <select name="candidateType" className="field mt-1" defaultValue="Private Candidate">
                {candidateTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Target series</span>
              <select name="seriesMonth" className="field mt-1" defaultValue="June">
                {examSeriesMonths.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Target year</span>
              <select name="seriesYear" className="field mt-1" defaultValue="2028">
                {examSeriesYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-caption text-muted">
            A private candidate takes the alternative papers: Paper 6 for the sciences, Paper 4 for Geography and
            History. The next step keeps those routes.
          </p>
        </fieldset>

        <fieldset className="space-y-4" hidden={step !== 2}>
          <legend className="text-heading font-semibold text-primary">Term calendar</legend>

          {[1, 2, 3].map((term) => (
            <div key={term} className="rounded-panel border border-subtle bg-sunken p-3">
              <p className="text-[0.875rem] font-medium text-primary">Term {term}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="label">First day</span>
                  <input type="date" name={`term${term}Start`} className="field mt-1" />
                </label>
                <label className="block">
                  <span className="label">Last day</span>
                  <input type="date" name={`term${term}End`} className="field mt-1" />
                </label>
              </div>
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Mid-term exam week</span>
              <input type="date" name="midtermWeek" className="field mt-1" />
            </label>
            <label className="block">
              <span className="label">Final exam week</span>
              <input type="date" name="finalWeek" className="field mt-1" />
            </label>
          </div>

          <div>
            <span className="label">Study days</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {studyDayOptions.map((day) => {
                const on = studyDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setStudyDays((days) =>
                        days.includes(day) ? days.filter((item) => item !== day) : [...days, day],
                      )
                    }
                    className={cn(
                      "pressable rounded-full border px-3 py-1 text-caption font-medium",
                      on ? "border-accent bg-accent text-on-accent" : "border-subtle bg-card text-secondary",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block max-w-48">
            <span className="label">Daily study cap (minutes)</span>
            <input
              type="number" inputMode="numeric"
              name="dailyMinutesCap"
              min={30}
              max={480}
              step={15}
              defaultValue={120}
              className="field mt-1 tabular"
            />
          </label>
        </fieldset>

        <fieldset className="space-y-4" hidden={step !== 3}>
          <legend className="text-heading font-semibold text-primary">Subjects and entry routes</legend>

          <div>
            <span className="label">Core subjects</span>
            <ul className="mt-1.5 space-y-1.5">
              {coreSubjects.map((subject) => {
                const on = selectedCore.includes(subject.code);
                return (
                  <li key={subject.code}>
                    <label className="flex items-center justify-between gap-3 rounded-panel border border-subtle bg-card px-3 py-2">
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setSelectedCore((codes) =>
                              codes.includes(subject.code)
                                ? codes.filter((code) => code !== subject.code)
                                : [...codes, subject.code],
                            )
                          }
                          className="size-4"
                        />
                        <span className="text-[0.875rem] text-primary">
                          {subject.code} {subject.name}
                        </span>
                      </span>
                      <Status tone={subject.hasRoute ? "neutral" : "warning"}>
                        {subject.hasRoute ? `${subject.papers} papers` : "No route yet"}
                      </Status>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <label className="block max-w-72">
            <span className="label">Term elective</span>
            <select value={elective} onChange={(event) => setElective(event.target.value)} className="field mt-1">
              <option value="">No elective</option>
              {electives.map((subject) => (
                <option key={subject.code} value={subject.code}>
                  {subject.code} {subject.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-panel border border-subtle bg-sunken p-3">
            <p className="label">Entry routes that will be applied</p>
            <ul className="mt-2 space-y-2">
              {routePreview.map((entry) => (
                <li key={entry.code} className="text-caption text-secondary">
                  <span className="font-semibold text-primary">
                    {entry.code} {entry.name}
                  </span>
                  {entry.hasRoute ? (
                    <span> - private candidate route with {entry.papers} papers</span>
                  ) : (
                    <span> - no private candidate route in the database yet</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </fieldset>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-panel border border-danger/40 bg-danger-soft px-3 py-2 text-caption text-danger-text"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
          className="btn-secondary pressable"
        >
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
            disabled={!canContinue}
            className="btn-primary pressable"
          >
            Continue
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2} />
          </button>
        ) : (
          <ActionButton
            pending={pending}
            pendingLabel="Saving"
            icon={<Sparkles aria-hidden="true" className="size-4" strokeWidth={2} />}
          >
            Finish setup
          </ActionButton>
        )}
      </div>
    </form>
  );
}
