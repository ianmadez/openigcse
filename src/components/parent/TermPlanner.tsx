"use client";

import { Save } from "lucide-react";

import { Status } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/Button";
import { useLocalDraft } from "@/lib/hooks/useLocalDraft";
import type { Enrollment, StudyTerm } from "@/lib/data/workspace";

type TermDraft = {
  label: string;
  startsOn: string;
  endsOn: string;
  midtermWeekStart: string;
  finalWeekStart: string;
};

type TermPlannerProps = {
  term: StudyTerm;
  enrollments: Enrollment[];
  electives: Array<{ code: string; name: string }>;
};

const emptyTerm = (label: string): TermDraft => ({
  label,
  startsOn: "",
  endsOn: "",
  midtermWeekStart: "",
  finalWeekStart: "",
});

export function TermPlanner({ term, enrollments, electives }: TermPlannerProps) {
  const initial = {
    terms: [
      emptyTerm("Term 1"),
      {
        label: term.name,
        startsOn: term.startsOn,
        endsOn: term.endsOn,
        midtermWeekStart: term.midtermWeekStart ?? "",
        finalWeekStart: term.finalWeekStart ?? "",
      },
      emptyTerm("Term 3"),
    ] as TermDraft[],
    enrolled: enrollments.filter((enrollment) => !enrollment.isElective).map((enrollment) => enrollment.subjectCode),
    elective: enrollments.find((enrollment) => enrollment.isElective)?.subjectCode ?? electives[0]?.code ?? "",
    weeklyMinutes: Object.fromEntries(
      enrollments.map((enrollment) => [enrollment.subjectCode, enrollment.weeklyMinutes]),
    ) as Record<string, number>,
  };

  const draft = useLocalDraft("openigcse.term-plan", initial);

  const updateTerm = (index: number, patch: Partial<TermDraft>) => {
    const terms = draft.value.terms.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    draft.setValue({ ...draft.value, terms });
  };

  const toggleEnrollment = (code: string) => {
    const enrolled = draft.value.enrolled.includes(code)
      ? draft.value.enrolled.filter((item) => item !== code)
      : [...draft.value.enrolled, code];
    draft.setValue({ ...draft.value, enrolled });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        draft.save(draft.value);
      }}
      className="space-y-4"
    >
      <fieldset className="surface p-4">
        <legend className="px-1 text-heading font-semibold text-primary">Terms</legend>
        <div className="mt-2 space-y-4">
          {draft.value.terms.map((item, index) => (
            <div key={item.label} className="rounded-panel border border-subtle bg-sunken p-3">
              <p className="text-[0.875rem] font-medium text-primary">{item.label}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["startsOn", "First day"],
                    ["endsOn", "Last day"],
                    ["midtermWeekStart", "Mid-term week"],
                    ["finalWeekStart", "Final week"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="block">
                    <span className="block text-caption text-muted">{label}</span>
                    <input
                      type="date"
                      value={item[field]}
                      onChange={(event) => updateTerm(index, { [field]: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-strong bg-card px-2.5 py-2 text-base text-primary focus:border-accent focus:outline-none sm:text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="surface p-4">
        <legend className="px-1 text-heading font-semibold text-primary">Subjects</legend>
        <ul className="mt-2 space-y-1.5">
          {enrollments
            .filter((enrollment) => !enrollment.isElective)
            .map((enrollment) => {
              const enrolled = draft.value.enrolled.includes(enrollment.subjectCode);
              return (
                <li key={enrollment.subjectCode}>
                  <label className="flex items-center justify-between gap-3 rounded-panel border border-subtle bg-sunken px-3 py-2">
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={enrolled}
                        onChange={() => toggleEnrollment(enrollment.subjectCode)}
                        className="size-4 accent-current"
                      />
                      <span className="text-[0.875rem] text-primary">
                        {enrollment.subjectCode} {enrollment.subjectName}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-caption text-muted">
                      <input
                        type="number"
                        min={30}
                        max={600}
                        step={15}
                        value={draft.value.weeklyMinutes[enrollment.subjectCode] ?? 150}
                        onChange={(event) =>
                          draft.setValue({
                            ...draft.value,
                            weeklyMinutes: {
                              ...draft.value.weeklyMinutes,
                              [enrollment.subjectCode]: Number(event.target.value),
                            },
                          })
                        }
                        className="w-16 rounded border border-strong bg-card px-2 py-1 text-right text-sm text-primary tabular focus:border-accent focus:outline-none"
                      />
                      min/week
                    </span>
                  </label>
                </li>
              );
            })}
        </ul>

        <label className="mt-3 block">
          <span className="block text-caption text-muted">Term elective</span>
          <select
            value={draft.value.elective}
            onChange={(event) => draft.setValue({ ...draft.value, elective: event.target.value })}
            className="mt-1 w-full rounded-lg border border-strong bg-card px-2.5 py-2 text-base text-primary focus:border-accent focus:outline-none sm:text-sm"
          >
            {electives.map((subject) => (
              <option key={subject.code} value={subject.code}>
                {subject.code} {subject.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton icon={<Save aria-hidden="true" className="size-4" strokeWidth={2} />}>Save plan</SubmitButton>
        <button type="button" onClick={draft.reset} className="btn-ghost pressable">
          Reset
        </button>
        {draft.savedAt && <Status tone="success">Saved on this device at {draft.savedAt}</Status>}
      </div>
    </form>
  );
}
