"use client";

import { AlertTriangle, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveTermPlanAction, type TermPlanResult } from "@/app/(parent)/parent/(gated)/term-planner/actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Status } from "@/components/ui/primitives";
import type { RouteOption } from "@/lib/data/enrollments";
import { seriesCountdown } from "@/lib/planning/series";
import { cn } from "@/lib/utils/cn";

type TermRow = {
  id?: string;
  key: string;
  name: string;
  startsOn: string;
  endsOn: string;
  midtermWeekStart: string;
  finalWeekStart: string;
  status?: string;
};

type SubjectChoice = {
  enrolled: boolean;
  routeId: string;
  isElective: boolean;
  weeklyMinutes: number;
  targetGrade: string;
  targetExamSeries: string;
};

export type TermPlannerProps = {
  terms: Array<Omit<TermRow, "key" | "midtermWeekStart" | "finalWeekStart"> & {
    id: string;
    midtermWeekStart: string | null;
    finalWeekStart: string | null;
  }>;
  termId: string;
  options: RouteOption[];
  enrollments: Array<{
    routeId: string;
    isElective: boolean;
    weeklyMinutes: number;
    targetGrade: string | null;
    targetExamSeries: string | null;
  }>;
  seriesOptions: string[];
  defaultSeries: string | null;
  today: string;
};

const GRADES = ["A*", "A", "B", "C", "D", "E", "F", "G"];

const DATE_FIELDS = [
  ["startsOn", "First day"],
  ["endsOn", "Last day"],
  ["midtermWeekStart", "Mid-term week starts"],
  ["finalWeekStart", "Final week starts"],
] as const;

function outsideTerm(row: TermRow) {
  if (!row.startsOn || !row.endsOn) return [];
  return (
    [
      ["mid-term week", row.midtermWeekStart],
      ["final week", row.finalWeekStart],
    ] as const
  )
    .filter(([, value]) => value && (value < row.startsOn || value > row.endsOn))
    .map(([label]) => label);
}

export function TermPlanner({ terms, termId, options, enrollments, seriesOptions, defaultSeries, today }: TermPlannerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TermPlanResult | null>(null);
  const [applyToAllTerms, setApplyToAllTerms] = useState(true);

  const [termRows, setTermRows] = useState<TermRow[]>(() =>
    terms.map((term) => ({
      ...term,
      key: term.id,
      midtermWeekStart: term.midtermWeekStart ?? "",
      finalWeekStart: term.finalWeekStart ?? "",
    })),
  );

  const [choices, setChoices] = useState<Record<string, SubjectChoice>>(() => {
    const byRoute = new Map(enrollments.map((enrollment) => [enrollment.routeId, enrollment]));
    return Object.fromEntries(
      options.map((option) => {
        const current = option.routes.map((route) => byRoute.get(route.id)).find(Boolean);
        const routeId = current?.routeId ?? option.routes.find((route) => route.privateCandidateEligible)?.id ?? option.routes[0]!.id;
        return [
          option.subjectCode,
          {
            enrolled: Boolean(current),
            routeId,
            isElective: current?.isElective ?? option.category === "Languages",
            weeklyMinutes: current?.weeklyMinutes ?? 150,
            targetGrade: current?.targetGrade ?? "A",
            targetExamSeries: current?.targetExamSeries ?? defaultSeries ?? "",
          },
        ];
      }),
    );
  });

  const updateTerm = (key: string, patch: Partial<TermRow>) =>
    setTermRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const updateChoice = (code: string, patch: Partial<SubjectChoice>) =>
    setChoices((current) => ({ ...current, [code]: { ...current[code]!, ...patch } }));

  const addTerm = () =>
    setTermRows((rows) => [
      ...rows,
      { key: `new-${rows.length}`, name: "", startsOn: "", endsOn: "", midtermWeekStart: "", finalWeekStart: "" },
    ]);

  const save = () => {
    setResult(null);
    startTransition(async () => {
      const response = await saveTermPlanAction({
        termId,
        applyToAllTerms,
        terms: termRows.map(({ id, name, startsOn, endsOn, midtermWeekStart, finalWeekStart }) => ({
          ...(id ? { id } : {}),
          name,
          startsOn,
          endsOn,
          midtermWeekStart,
          finalWeekStart,
        })),
        enrollments: options
          .filter((option) => choices[option.subjectCode]?.enrolled)
          .map((option) => {
            const choice = choices[option.subjectCode]!;
            return {
              routeId: choice.routeId,
              isElective: choice.isElective,
              weeklyMinutes: choice.weeklyMinutes,
              targetGrade: choice.targetGrade,
              targetExamSeries: choice.targetExamSeries || null,
            };
          }),
      });
      setResult(response);
      if (response.ok) router.refresh();
    });
  };

  const selectedTerm = termRows.find((row) => row.id === termId);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <fieldset className="surface p-4">
        <legend className="px-1 text-heading font-semibold text-primary">Terms</legend>
        <div className="mt-2 space-y-3">
          {termRows.map((row) => (
            <div key={row.key} className="rounded-panel border border-subtle bg-sunken p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {row.id ? (
                  <p className="text-[0.875rem] font-medium text-primary">{row.name}</p>
                ) : (
                  <label className="block min-w-0 flex-1">
                    <span className="label">New term name</span>
                    <input
                      value={row.name}
                      maxLength={60}
                      required
                      onChange={(event) => updateTerm(row.key, { name: event.target.value })}
                      placeholder="2028 - Term 4"
                      className="field mt-1.5"
                    />
                  </label>
                )}
                {row.status && <Status tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Status>}
              </div>

              {outsideTerm(row).length > 0 && (
                <p role="note" className="mt-2 flex items-start gap-1.5 text-caption text-warning-text">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                  The {outsideTerm(row).join(" and ")} falls outside this term&apos;s dates. Move it or clear it before
                  saving.
                </p>
              )}

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {DATE_FIELDS.map(([field, label]) => (
                  <label key={field} className="block">
                    <span className="block text-caption text-muted">{label}</span>
                    <input
                      type="date"
                      value={row[field]}
                      required={field === "startsOn" || field === "endsOn"}
                      onChange={(event) => updateTerm(row.key, { [field]: event.target.value })}
                      className="field mt-1"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={addTerm} className="btn-ghost pressable mt-3">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
          Add a term
        </button>
      </fieldset>

      <fieldset className="surface p-4">
        <legend className="px-1 text-heading font-semibold text-primary">Subjects and entry routes</legend>

        {terms.length > 1 && (
          <nav aria-label="Term to enrol" className="mt-2 flex flex-wrap gap-1.5">
            {terms.map((term) => (
              <Link
                key={term.id}
                href={`/parent/term-planner?term=${term.id}`}
                aria-current={term.id === termId ? "page" : undefined}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-caption",
                  term.id === termId ? "border-accent bg-accent-soft text-accent-text" : "border-subtle bg-card text-secondary",
                )}
              >
                {term.name}
              </Link>
            ))}
          </nav>
        )}

        <p className="mt-2 text-caption text-muted">
          Editing subjects for {selectedTerm?.name ?? "this term"}. Only subjects with an imported syllabus and at least one
          entry route are listed.
        </p>

        {options.length === 0 ? (
          <p className="mt-3 text-caption text-secondary">No subject has an entry route yet. Import a syllabus package first.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {options.map((option) => {
              const choice = choices[option.subjectCode]!;
              const route = option.routes.find((item) => item.id === choice.routeId);
              const countdown = seriesCountdown(choice.targetExamSeries || null, new Date(`${today}T00:00:00Z`));

              return (
                <li key={option.subjectCode} className="rounded-panel border border-subtle bg-sunken p-3">
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={choice.enrolled}
                      onChange={(event) => updateChoice(option.subjectCode, { enrolled: event.target.checked })}
                      className="size-4"
                    />
                    <span className="text-[0.875rem] font-medium text-primary">
                      {option.subjectCode} {option.subjectName}
                    </span>
                    {option.versionStatus !== "verified" && <Status tone="warning">Draft syllabus</Status>}
                  </label>

                  {choice.enrolled && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="label">Entry route</span>
                        <select
                          value={choice.routeId}
                          onChange={(event) => updateChoice(option.subjectCode, { routeId: event.target.value })}
                          className="field mt-1.5"
                        >
                          {option.routes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.tier})
                            </option>
                          ))}
                        </select>
                      </label>

                      {route && !route.privateCandidateEligible && (
                        <p role="note" className="flex items-start gap-1.5 text-caption text-warning-text sm:col-span-2">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                          This route is not open to private candidates. It needs a school or centre to run part of the
                          assessment.{route.notes ? ` ${route.notes}` : ""}
                        </p>
                      )}

                      <label className="block">
                        <span className="label">Minutes per week</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={1500}
                          step={15}
                          value={choice.weeklyMinutes}
                          onChange={(event) =>
                            updateChoice(option.subjectCode, { weeklyMinutes: Number(event.target.value) || 0 })
                          }
                          className="field mt-1.5 tabular"
                        />
                      </label>

                      <label className="block">
                        <span className="label">Target grade</span>
                        <select
                          value={choice.targetGrade}
                          onChange={(event) => updateChoice(option.subjectCode, { targetGrade: event.target.value })}
                          className="field mt-1.5"
                        >
                          {(GRADES.includes(choice.targetGrade) ? GRADES : [choice.targetGrade, ...GRADES]).map((grade) => (
                            <option key={grade} value={grade}>
                              {grade}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="label">Exam series</span>
                        <select
                          value={choice.targetExamSeries}
                          onChange={(event) => updateChoice(option.subjectCode, { targetExamSeries: event.target.value })}
                          className="field mt-1.5"
                        >
                          <option value="">Not decided</option>
                          {seriesOptions.map((series) => (
                            <option key={series} value={series}>
                              {series}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-caption text-muted tabular">
                          {countdown
                            ? countdown.passed
                              ? "That series month has started."
                              : `${countdown.weeks} weeks to the start of ${choice.targetExamSeries} (month start, not the paper date)`
                            : "Pick a series to see the countdown."}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 self-end pb-2 text-[0.875rem] text-secondary">
                        <input
                          type="checkbox"
                          checked={choice.isElective}
                          onChange={(event) => updateChoice(option.subjectCode, { isElective: event.target.checked })}
                          className="size-4"
                        />
                        Elective
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <label className="mt-3 flex items-center gap-2 text-[0.875rem] text-secondary">
          <input
            type="checkbox"
            checked={applyToAllTerms}
            onChange={(event) => setApplyToAllTerms(event.target.checked)}
            className="size-4"
          />
          Use these subjects for every term
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton pending={pending} pendingLabel="Saving" icon={<Save aria-hidden="true" className="size-4" strokeWidth={2} />}>
          Save plan
        </ActionButton>
        <FormMessage result={result} />
      </div>
    </form>
  );
}
