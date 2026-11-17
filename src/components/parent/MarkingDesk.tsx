"use client";

import { BookMarked, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { Status } from "@/components/ui/primitives";
import type { ErrorTag } from "@/lib/data/mistakes";
import type { Assessment, Checkpoint } from "@/lib/data/workspace";
import { useLocalDraft } from "@/lib/hooks/useLocalDraft";
import { cn } from "@/lib/utils/cn";

type MarkingDeskProps = {
  assessments: Assessment[];
  checkpoints: Checkpoint[];
};

type MarkDraft = {
  assessmentId: string;
  marks: Record<string, number>;
  tags: Record<string, ErrorTag>;
  logged: string[];
};

const ERROR_TAGS: Array<{ value: ErrorTag; label: string; hint: string }> = [
  { value: "ConceptGap", label: "Concept gap", hint: "Did not know the idea" },
  { value: "CommandWordMisread", label: "Command word", hint: "Answered a different verb" },
  { value: "CalculationSlip", label: "Calculation", hint: "Right method, wrong arithmetic" },
  { value: "IncompleteExplanation", label: "Incomplete answer", hint: "Right idea, not enough detail" },
  { value: "TimePressure", label: "Time pressure", hint: "Ran out of time or left items blank" },
];

export function MarkingDesk({ assessments, checkpoints }: MarkingDeskProps) {
  const [initialAssessment] = useState(assessments[0]?.id ?? "");
  const draft = useLocalDraft<MarkDraft>("openigcse.marking-desk", {
    assessmentId: initialAssessment,
    marks: {},
    tags: {},
    logged: [],
  });
  const [openTagFor, setOpenTagFor] = useState<string | null>(null);

  const assessment = assessments.find((item) => item.id === draft.value.assessmentId) ?? assessments[0] ?? null;

  const items = useMemo(
    () =>
      checkpoints.map((checkpoint) => ({
        checkpoint,
        available: 1,
        awarded: draft.value.marks[checkpoint.objectiveCode],
      })),
    [checkpoints, draft.value.marks],
  );

  const awarded = items.reduce((sum, item) => sum + (item.awarded ?? 0), 0);
  const total = items.reduce((sum, item) => sum + item.available, 0);

  const setMark = (objectiveCode: string, value: number) => {
    const marks = { ...draft.value.marks, [objectiveCode]: Math.max(0, Math.min(1, value)) };
    draft.setValue({ ...draft.value, marks });
    setOpenTagFor(value >= 1 ? null : objectiveCode);
  };

  const logMistake = (objectiveCode: string, tag: ErrorTag) => {
    draft.setValue({
      ...draft.value,
      tags: { ...draft.value.tags, [objectiveCode]: tag },
      logged: draft.value.logged.includes(objectiveCode) ? draft.value.logged : [...draft.value.logged, objectiveCode],
    });
    setOpenTagFor(null);
  };

  return (
    <div className="space-y-4">
      <div className="surface p-4">
        <label htmlFor="assessment" className="label">
          Assessment
        </label>
        <select
          id="assessment"
          value={draft.value.assessmentId}
          onChange={(event) => {
            const next = event.target.value;
            draft.setValue({ assessmentId: next, marks: {}, tags: {}, logged: [] });
          }}
          className="mt-1.5 w-full rounded-lg border border-strong bg-card px-2.5 py-2 text-base text-primary focus:border-accent focus:outline-none sm:text-sm"
        >
          {assessments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} ({item.kind.replace("_", " ")})
            </option>
          ))}
        </select>

        {assessment && (
          <p className="mt-2 text-caption text-muted">
            {assessment.durationMinutes ? `${assessment.durationMinutes} min` : "Untimed"} -{" "}
            {assessment.totalMarks ?? total} marks available - {assessment.daysUntil} days away
          </p>
        )}
      </div>

      <div className="surface divide-y divide-subtle">
        {items.map(({ checkpoint, available, awarded: mark }) => {
          const deducted = mark !== undefined && mark < available;
          const logged = draft.value.logged.includes(checkpoint.objectiveCode);

          return (
            <div key={checkpoint.objectiveCode} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="chip tabular">{checkpoint.objectiveCode}</p>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-primary">{checkpoint.prompt}</p>
                  <p className="mt-1 text-caption text-muted">Model answer: {checkpoint.modelAnswer}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  {[0, 1].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMark(checkpoint.objectiveCode, value)}
                      aria-pressed={mark === value}
                      className={cn(
                        "min-w-11 rounded-lg border px-2.5 py-1.5 text-sm font-medium tabular",
                        mark === value
                          ? value === 1
                            ? "border-success/50 bg-success-soft text-success-text"
                            : "border-danger/50 bg-danger-soft text-danger-text"
                          : "border-subtle bg-card text-secondary",
                      )}
                    >
                      {value}/{available}
                    </button>
                  ))}
                </div>
              </div>

              {deducted && (
                <div className="mt-3 rounded-panel border border-warning/40 bg-warning-soft p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-caption font-medium text-warning-text">
                      Mark deducted. Tag the reason so it reaches the notebook.
                    </p>
                    {logged ? (
                      <Status tone="success">In the notebook</Status>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTagFor(openTagFor === checkpoint.objectiveCode ? null : checkpoint.objectiveCode)
                        }
                        className="btn-secondary pressable"
                      >
                        <BookMarked aria-hidden="true" className="size-3.5" strokeWidth={2} />
                        Log mistake
                      </button>
                    )}
                  </div>

                  {openTagFor === checkpoint.objectiveCode && !logged && (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {ERROR_TAGS.map((tag) => (
                        <button
                          key={tag.value}
                          type="button"
                          onClick={() => logMistake(checkpoint.objectiveCode, tag.value)}
                          className="rounded-lg border border-subtle bg-card px-2.5 py-1.5 text-left text-caption text-secondary"
                        >
                          <span className="block font-medium text-primary">{tag.label}</span>
                          <span className="block text-muted">{tag.hint}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {logged && draft.value.tags[checkpoint.objectiveCode] && (
                    <p className="mt-1.5 text-caption text-warning-text">
                      Tagged {ERROR_TAGS.find((tag) => tag.value === draft.value.tags[checkpoint.objectiveCode])?.label}
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => draft.save(draft.value)} className="btn-primary pressable">
          <Save aria-hidden="true" className="size-4" strokeWidth={2} />
          Save marks
        </button>
        <span className="text-caption text-secondary tabular">
          {awarded} of {total} marks awarded
        </span>
        {draft.savedAt && <Status tone="success">Saved at {draft.savedAt}</Status>}
      </div>
    </div>
  );
}
