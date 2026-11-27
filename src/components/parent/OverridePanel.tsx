"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState } from "react";

import {
  deleteOverrideAction,
  saveOverrideAction,
} from "@/app/(parent)/parent/(gated)/timetable/actions";
import { ActionButton, SubmitButton } from "@/components/ui/Button";
import { EmptyState, Status } from "@/components/ui/primitives";
import { keepInput, useResetOnSuccess } from "@/lib/utils/keepInput";

type Override = {
  id: string;
  date: string;
  type: string;
  reason: string;
  preserveStreak: boolean;
  customMinutesCap: number | null;
};

const TYPES: Array<{ value: string; label: string; tone: "neutral" | "warning" | "info" | "danger" }> = [
  { value: "holiday", label: "Holiday", tone: "info" },
  { value: "sick_day", label: "Sick day", tone: "danger" },
  { value: "half_day", label: "Half day", tone: "warning" },
  { value: "exam_day", label: "Exam day", tone: "warning" },
  { value: "ramadan_schedule", label: "Ramadan schedule", tone: "neutral" },
  { value: "custom", label: "Custom", tone: "neutral" },
];

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function OverridePanel({ overrides, today }: { overrides: Override[]; today: string }) {
  const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(
    async (_previous, formData) => {
      const preserve = formData.get("preserveStreak") === "on";
      const capRaw = String(formData.get("customMinutesCap") ?? "").trim();

      return saveOverrideAction({
        date: String(formData.get("date") ?? today),
        type: String(formData.get("type") ?? "holiday"),
        reason: String(formData.get("reason") ?? ""),
        preserveStreak: preserve,
        customMinutesCap: capRaw === "" ? null : Number(capRaw),
      });
    },
    null,
  );
  const form = useResetOnSuccess(state, Boolean(state?.ok));

  return (
    <div className="space-y-4">
      <form ref={form} onSubmit={keepInput(formAction)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Date</span>
            <input type="date" name="date" defaultValue={today} required className="field mt-1.5" />
          </label>

          <label className="block">
            <span className="label">What happens</span>
            <select name="type" defaultValue="holiday" className="field mt-1.5">
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="label">Reason</span>
          <input
            name="reason"
            maxLength={120}
            placeholder="Family trip, clinic appointment, public holiday"
            className="field mt-1.5"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Study minutes that day</span>
            <input
              name="customMinutesCap"
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              step={15}
              placeholder="Leave blank for the term cap"
              className="field mt-1.5"
            />
          </label>

          <label className="flex items-center gap-2 self-end pb-2 text-[0.875rem] text-secondary">
            <input type="checkbox" name="preserveStreak" defaultChecked className="size-4" />
            Keep the streak
          </label>
        </div>

        <ActionButton pending={pending} pendingLabel="Saving" icon={<Plus aria-hidden="true" className="size-4" strokeWidth={2} />}>
          Add override
        </ActionButton>

        <p
          role="status"
          aria-live="polite"
          className={state?.error ? "text-caption text-danger-text" : "invisible text-caption"}
        >
          {state?.error ?? "placeholder"}
        </p>
      </form>

      {overrides.length === 0 ? (
        <EmptyState title="No exceptions yet">
          A holiday, sick day or half day here replaces the weekly template for that one date.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-subtle">
          {overrides.map((override) => {
            const type = TYPES.find((entry) => entry.value === override.type);

            return (
              <li key={override.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block text-[0.875rem] text-primary">
                    {dateFormat.format(new Date(`${override.date}T00:00:00`))}
                  </span>
                  <span className="block text-caption text-muted">
                    {override.reason || type?.label || override.type}
                    {override.customMinutesCap !== null ? ` - ${override.customMinutesCap} min` : ""}
                    {override.preserveStreak ? " - streak kept" : ""}
                  </span>
                </span>

                <div className="flex items-center gap-2">
                  <Status tone={type?.tone ?? "neutral"}>{type?.label ?? override.type}</Status>
                  <form
                    action={async () => {
                      await deleteOverrideAction(override.id);
                    }}
                  >
                    <SubmitButton variant="ghost" aria-label={`Remove ${override.date} override`}>
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />
                    </SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
