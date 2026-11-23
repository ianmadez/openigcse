"use client";

import { ExternalLink, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { saveMarksAction, type SaveMarksResult } from "@/app/(parent)/parent/(gated)/marking-desk/actions";
import { ActionButton } from "@/components/ui/Button";
import { MathMarkdown } from "@/components/ui/MathMarkdown";
import { Status } from "@/components/ui/primitives";
import { ERROR_TAGS, type SheetMark } from "@/lib/assessment/marking";
import { estimateGrade, validateMarks } from "@/lib/assessment/scoring";
import type { MarkingSheet } from "@/lib/data/marking";
import type { ErrorTag } from "@/lib/data/mistakes";
import { cn } from "@/lib/utils/cn";

export function MarkingDesk({ sheet }: { sheet: MarkingSheet }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [marks, setMarks] = useState<Record<string, SheetMark>>(sheet.marks);
  const [feedback, setFeedback] = useState(sheet.assessment.feedback ?? "");
  const [result, setResult] = useState<SaveMarksResult | null>(null);
  const rows = useRef<Record<string, HTMLLIElement | null>>({});

  const totals = useMemo(() => {
    const available = sheet.items.reduce((sum, item) => sum + item.available, 0);
    const awarded = sheet.items.reduce((sum, item) => sum + (marks[item.questionId]?.awarded ?? 0), 0);
    const unmarked = sheet.items.filter((item) => marks[item.questionId]?.awarded === null).length;
    const percent = available ? Math.round((awarded / available) * 1000) / 10 : 0;
    return { available, awarded, unmarked, percent, grade: estimateGrade(percent, sheet.assessment.thresholds) };
  }, [marks, sheet]);

  const set = (questionId: string, patch: Partial<SheetMark>) =>
    setMarks((current) => ({ ...current, [questionId]: { ...current[questionId]!, ...patch, auto: false } }));

  const save = () => {
    const entries = sheet.items.map((item) => ({ questionId: item.questionId, available: item.available, ...marks[item.questionId]! }));
    const check = validateMarks(entries);
    if (!check.ok) {
      setResult(check);
      rows.current[check.questionId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setResult(null);
    startTransition(async () => {
      const response = await saveMarksAction({
        assessmentId: sheet.assessment.id,
        feedback,
        marks: entries.map(({ questionId, awarded, errorCategory, feedback: note }) => ({ questionId, awarded, errorCategory, feedback: note })),
      });
      setResult(response);
      if (response.ok) router.refresh();
      else if (response.questionId) rows.current[response.questionId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const failedOn = result && !result.ok && "questionId" in result ? result.questionId : null;

  return (
    <div className="space-y-4">
      {!sheet.sat && (
        <p className="text-caption text-secondary">
          No online sitting for this paper, so there are no typed answers. Mark it from the learner&apos;s paper copy.
        </p>
      )}
      {sheet.assessment.paperUrl && (
        <a href={sheet.assessment.paperUrl} target="_blank" rel="noreferrer noopener" className="btn-secondary pressable inline-flex">
          <ExternalLink aria-hidden="true" className="size-4" strokeWidth={2} />
          Open the paper
        </a>
      )}

      <ol className="space-y-3">
        {sheet.items.map((item) => {
          const mark = marks[item.questionId]!;
          const dropped = mark.awarded !== null && mark.awarded < item.available;
          const answered = item.selectedOption || item.answerText?.trim() || item.photoPaths.length;

          return (
            <li
              key={item.questionId}
              ref={(node) => {
                rows.current[item.questionId] = node;
              }}
              className={cn("surface p-4", failedOn === item.questionId && "border-danger")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption font-medium text-muted tabular">
                  Question {item.number}
                  {item.objectiveCode ? ` - ${item.objectiveCode}` : ""}
                </p>
                <span className="chip tabular">
                  {item.available} {item.available === 1 ? "mark" : "marks"}
                </span>
              </div>

              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <MathMarkdown>{item.prompt}</MathMarkdown>
                  {item.imagePaths.map((path) =>
                    sheet.urls[path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={path} src={sheet.urls[path]} alt={`Diagram for question ${item.number}`} className="max-h-48 rounded-lg border border-subtle" />
                    ) : null,
                  )}
                  {item.parts.map((part) => (
                    <p key={part.label} className="text-caption text-secondary">
                      ({part.label}) {part.prompt} [{part.marks}]
                    </p>
                  ))}

                  <div className="rounded-panel border border-subtle bg-sunken p-3">
                    <p className="label">Learner&apos;s answer</p>
                    {item.options.length > 0 ? (
                      <p className="mt-1 text-[0.875rem] text-primary">
                        {item.selectedOption
                          ? `${item.selectedOption}: ${item.options.find((option) => option.letter === item.selectedOption)?.text ?? ""}`
                          : "No option chosen"}
                      </p>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-[0.875rem] text-primary">{item.answerText?.trim() || "No written answer"}</p>
                    )}
                    {item.photoPaths.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.photoPaths.map((path, index) =>
                          sheet.urls[path] ? (
                            <a key={path} href={sheet.urls[path]} target="_blank" rel="noreferrer noopener" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={sheet.urls[path]} alt={`Working photo ${index + 1}`} className="h-24 w-24 rounded-lg border border-subtle object-cover" />
                            </a>
                          ) : null,
                        )}
                      </div>
                    )}
                    {!answered && sheet.sat && <p className="mt-1 text-caption text-warning-text">Left blank.</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="rounded-panel border border-subtle p-3">
                    <p className="label">Model answer</p>
                    <div className="mt-1">
                      {item.correctOption ? (
                        <p className="text-[0.875rem] text-primary">
                          {item.correctOption}: {item.options.find((option) => option.letter === item.correctOption)?.text}
                        </p>
                      ) : item.modelAnswer ? (
                        <MathMarkdown>{item.modelAnswer}</MathMarkdown>
                      ) : (
                        <p className="text-caption text-muted">None written.</p>
                      )}
                    </div>
                    <p className="label mt-3">Marking guide</p>
                    <p className="mt-1 whitespace-pre-wrap text-caption text-secondary">{item.markScheme}</p>
                  </div>

                  <fieldset>
                    <legend className="label">Mark {mark.auto && <span className="normal-case text-muted">(from the answer key)</span>}</legend>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.available <= 10 ? (
                        Array.from({ length: item.available + 1 }, (_, value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={mark.awarded === value}
                            onClick={() => set(item.questionId, { awarded: value, errorCategory: value < item.available ? mark.errorCategory : null })}
                            className={cn(
                              "min-w-11 rounded-lg border px-2.5 py-1.5 text-sm font-medium tabular",
                              mark.awarded === value
                                ? value === item.available
                                  ? "border-success/50 bg-success-soft text-success-text"
                                  : "border-warning/50 bg-warning-soft text-warning-text"
                                : "border-subtle bg-card text-secondary",
                            )}
                          >
                            {value}
                          </button>
                        ))
                      ) : (
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={item.available}
                          step={1}
                          aria-label={`Marks for question ${item.number}`}
                          value={mark.awarded ?? ""}
                          onChange={(event) => set(item.questionId, { awarded: event.target.value === "" ? null : Number(event.target.value) })}
                          className="field w-24 tabular"
                        />
                      )}
                    </div>
                  </fieldset>

                  {dropped && (
                    <fieldset className="rounded-panel border border-warning/40 bg-warning-soft p-3">
                      <legend className="sr-only">Why was the mark dropped?</legend>
                      <p className="text-caption font-medium text-warning-text">Why was the mark dropped? It goes in the notebook.</p>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {ERROR_TAGS.map((tag) => (
                          <label
                            key={tag.value}
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-caption",
                              mark.errorCategory === tag.value ? "border-accent bg-card" : "border-subtle bg-card",
                            )}
                          >
                            <input
                              type="radio"
                              name={`reason-${item.questionId}`}
                              checked={mark.errorCategory === tag.value}
                              onChange={() => set(item.questionId, { errorCategory: tag.value as ErrorTag })}
                              className="mt-0.5 size-3.5"
                            />
                            <span>
                              <span className="block font-medium text-primary">{tag.label}</span>
                              <span className="block text-muted">{tag.hint}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  <label className="block">
                    <span className="label">Note for the learner (optional)</span>
                    <input
                      value={mark.feedback}
                      maxLength={1000}
                      onChange={(event) => set(item.questionId, { feedback: event.target.value })}
                      className="field mt-1.5"
                    />
                  </label>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="surface space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 tabular">
          <span className="text-heading font-semibold text-primary">
            {totals.awarded} / {totals.available}
          </span>
          <span className="text-secondary">{totals.percent}%</span>
          {totals.grade ? (
            <Status tone="info">Estimated grade {totals.grade}</Status>
          ) : (
            <span className="text-caption text-muted">
              {sheet.assessment.thresholds.length ? "Below the lowest threshold" : "Add grade thresholds to the assessment for an estimate"}
            </span>
          )}
          {totals.unmarked > 0 && <Status tone="warning">{totals.unmarked} still to mark</Status>}
        </div>
        <label className="block">
          <span className="label">Overall feedback (optional)</span>
          <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={2} maxLength={2000} className="field mt-1.5" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            type="button"
            pending={pending}
            pendingLabel="Saving"
            onClick={save}
            icon={<Save aria-hidden="true" className="size-4" strokeWidth={2} />}
          >
            {sheet.assessment.state === "marked" ? "Save changes" : "Save marks"}
          </ActionButton>
          {result && !result.ok && (
            <p role="alert" className="text-caption font-medium text-danger-text">
              {result.error}
            </p>
          )}
          {result?.ok && (
            <p role="status" className="text-caption text-success-text">
              {result.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
