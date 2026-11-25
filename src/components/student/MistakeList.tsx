"use client";

import { Check, Send, Tag } from "lucide-react";
import { useState, useTransition } from "react";

import { resolveMistakeAction } from "@/app/(student)/review/actions";
import { ActionButton } from "@/components/ui/Button";
import { EmptyState, Status } from "@/components/ui/primitives";
import { ERROR_TAGS } from "@/lib/assessment/marking";
import type { Mistake } from "@/lib/data/mistakes";
import { resolveMode, type ResolveMode } from "@/lib/learning/resolve";
import { cn } from "@/lib/utils/cn";

const tagTone = {
  ConceptGap: "danger",
  CommandWordMisread: "warning",
  CalculationSlip: "info",
  IncompleteExplanation: "neutral",
  TimePressure: "neutral",
} as const;

export function MistakeList({ mistakes }: { mistakes: Mistake[] }) {
  if (mistakes.length === 0) {
    return (
      <EmptyState title="Nothing in the notebook">
        Mistakes appear here when a mark is deducted at the marking desk.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-subtle">
      {mistakes.map((mistake) => (
        <MistakeItem key={mistake.id} mistake={mistake} />
      ))}
    </ul>
  );
}

function MistakeItem({ mistake }: { mistake: Mistake }) {
  const [mode, setMode] = useState<ResolveMode>(
    resolveMode({
      status: mistake.status,
      questionType: mistake.question?.type ?? null,
      hasOptions: (mistake.question?.options.length ?? 0) > 0,
      correctionSubmitted: mistake.correctionSubmitted,
    }),
  );
  const [option, setOption] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (mode === "retry" && !option) return setMessage({ tone: "error", text: "Pick an answer first." });
    if (mode === "correction" && correction.trim().length < 3) {
      return setMessage({ tone: "error", text: "Write the correct answer first." });
    }
    setMessage(null);
    startTransition(async () => {
      const result = await resolveMistakeAction(
        mode === "retry" ? { id: mistake.id, option: option ?? "" } : { id: mistake.id, correction },
      );
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
      } else if (result.resolved) {
        setMode("done");
      } else if (result.awaitingParent) {
        setMode("waiting");
      } else {
        setOption(null);
        setMessage({ tone: "info", text: "Not quite. Look at the note again and have another go." });
      }
    });
  };

  const done = mode === "done";

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip tabular">{mistake.objectiveCode}</span>
        <Status tone={tagTone[mistake.errorTag]}>
          <Tag aria-hidden="true" className="size-3" strokeWidth={2.2} />
          {ERROR_TAGS.find((tag) => tag.value === mistake.errorTag)?.label ?? mistake.errorTag}
        </Status>
        {done && <Status tone="success">Resolved</Status>}
        {mode === "waiting" && <Status tone="info">Waiting for a parent</Status>}
      </div>

      <p className={cn("mt-2 text-[0.875rem] leading-relaxed", done ? "text-muted line-through" : "text-secondary")}>
        {mistake.note}
      </p>

      {mode === "retry" && mistake.question && (
        <fieldset className="mt-2.5">
          <legend className="text-[0.8125rem] font-medium text-primary">Try it again: {mistake.question.prompt}</legend>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {mistake.question.options.map((item) => (
              <label
                key={item.letter}
                className={cn(
                  "pressable flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[0.8125rem]",
                  option === item.letter ? "border-accent-line bg-accent-soft text-accent-text" : "border-subtle text-secondary",
                )}
              >
                <input
                  type="radio"
                  name={`retry-${mistake.id}`}
                  value={item.letter}
                  checked={option === item.letter}
                  onChange={() => setOption(item.letter)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">{item.letter}.</span> {item.text}
                </span>
              </label>
            ))}
          </div>
          <ActionButton
            type="button"
            pending={pending}
            pendingLabel="Checking"
            variant="secondary"
            onClick={submit}
            icon={<Check aria-hidden="true" className="size-3.5" strokeWidth={2.4} />}
            className="mt-2.5"
          >
            Check my answer
          </ActionButton>
        </fieldset>
      )}

      {mode === "correction" && (
        <div className="mt-2.5">
          <label htmlFor={`correction-${mistake.id}`} className="label">
            Write the correct answer
          </label>
          <textarea
            id={`correction-${mistake.id}`}
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            rows={3}
            maxLength={2000}
            className="field mt-1.5"
          />
          <ActionButton
            type="button"
            pending={pending}
            pendingLabel="Sending"
            variant="secondary"
            onClick={submit}
            icon={<Send aria-hidden="true" className="size-3.5" strokeWidth={2.2} />}
            className="mt-2"
          >
            Send to a parent
          </ActionButton>
        </div>
      )}

      <p
        role={message?.tone === "error" ? "alert" : "status"}
        aria-live="polite"
        className={message ? cn("mt-2 text-caption", message.tone === "error" ? "text-danger-text" : "text-secondary") : "sr-only"}
      >
        {message?.text ?? ""}
      </p>
    </li>
  );
}
