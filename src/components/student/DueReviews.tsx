"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { addCheckpointMistakeAction, answerCheckpointAction } from "@/app/(student)/learning-actions";
import { AddToNotebook } from "@/components/student/AddToNotebook";
import { EmptyState, Meter, Status } from "@/components/ui/primitives";
import type { Checkpoint } from "@/lib/data/questions";
import type { DueReview } from "@/lib/data/retention";
import { checkpointMessage } from "@/lib/learning/resolve";
import { dueLabel } from "@/lib/retention/fsrs";
import { cn } from "@/lib/utils/cn";

export type DueReviewRow = DueReview & { checkpoint: Checkpoint | null };

type Result = { ok: true; correct: boolean; correctOption: string | null; explanation: string } | { ok: false; error: string };

/** Step 4.3: the "Due for review" tab. Answering writes a new Active_Recall event and reschedules. */
export function DueReviews({ items, nowIso }: { items: DueReviewRow[]; nowIso: string }) {
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing due">
        Every reviewed objective is still above its interval. The notebook tab has the mistakes waiting for a fix.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <DueCard key={item.objectiveId} item={item} nowIso={nowIso} />
      ))}
    </ul>
  );
}

function DueCard({ item, nowIso }: { item: DueReviewRow; nowIso: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!item.checkpoint || !selected) return;
    setChecking(true);
    const outcome = await answerCheckpointAction({ questionId: item.checkpoint.id, option: selected, kind: "recall" }).catch(
      () => ({ ok: false as const, error: "The server could not be reached." }),
    );
    setResult(outcome);
    setChecking(false);
  };

  const answered = result?.ok === true;

  return (
    <li className="rounded-panel border border-subtle bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip tabular">{item.objectiveCode}</span>
        <span className="min-w-0 text-caption text-muted">
          {item.subjectName}
          {item.topicName ? ` · ${item.topicName}` : ""}
        </span>
        <Status tone="warning">{dueLabel(item.dueAt, new Date(nowIso))}</Status>
      </div>

      <p className="mt-2 text-[0.9375rem] font-medium leading-snug text-primary">{item.objectiveText}</p>

      <div className="mt-2.5">
        <Meter
          value={Math.round(item.retrievability * 100)}
          label="Chance you still recall it"
          hint={`${item.reps} ${item.reps === 1 ? "review" : "reviews"} so far${item.lapses > 0 ? ` · ${item.lapses} slipped` : ""}`}
        />
      </div>

      {!item.checkpoint ? (
        <p className="mt-3 text-caption text-secondary">
          No checkpoint is written for this objective yet. A lesson, practice question or paper on it also counts.{" "}
          <Link href="/today" className="text-accent-text underline">
            Open Today
          </Link>
        </p>
      ) : answered ? (
        <>
          <div
            role="status"
            className={cn(
              "mt-3 rounded-panel border px-3 py-2 text-caption",
              result.correct
                ? "border-success/40 bg-success-soft text-success-text"
                : "border-warning/40 bg-warning-soft text-warning-text",
            )}
          >
            <p className="font-semibold">{checkpointMessage(result)}</p>
            {result.explanation && <p className="mt-0.5">{result.explanation}</p>}
          </div>
          {!result.correct && selected && (
            <AddToNotebook
              onAdd={(category) =>
                addCheckpointMistakeAction({ questionId: item.checkpoint!.id, option: selected, category })
              }
            />
          )}
          <p className="mt-2 flex items-center gap-1.5 text-caption text-muted">
            <CheckCircle2 aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Recorded. The next review date has moved.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[0.8125rem] font-medium text-primary">{item.checkpoint.prompt}</p>

          <div role="radiogroup" aria-label={`Answers for ${item.objectiveCode}`} className="mt-2 space-y-1.5">
            {item.checkpoint.options.map((option) => {
              const chosen = selected === option.letter;
              return (
                <button
                  key={option.letter}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={checking}
                  onClick={() => setSelected(option.letter)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-[0.8125rem] leading-snug",
                    chosen ? "border-accent-line bg-accent-soft text-primary" : "border-subtle bg-card text-secondary",
                  )}
                >
                  <span aria-hidden="true" className="font-semibold tabular">
                    {option.letter}
                  </span>
                  <span>{option.text}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={check}
            disabled={!selected || checking}
            className="btn-primary pressable mt-2.5 w-full disabled:cursor-not-allowed disabled:opacity-40"
          >
            {checking ? "Checking" : "Check answer"}
          </button>

          {result && !result.ok && (
            <p role="alert" className="mt-2 text-caption text-danger-text">
              Not checked: {result.error}
            </p>
          )}
        </>
      )}
    </li>
  );
}
