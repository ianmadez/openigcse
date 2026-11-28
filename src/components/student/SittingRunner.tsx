"use client";

import { Camera, CheckCircle2, ExternalLink, Play, Send, Timer, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  autosaveAction,
  startSittingAction,
  submitSittingAction,
  uploadWorkingAction,
} from "@/app/(sitting)/assessments/[id]/actions";
import { MoreTimeButton } from "@/components/live/MoreTimeButton";
import { ActionButton } from "@/components/ui/Button";
import { WriteError } from "@/components/ui/WriteError";
import { MathMarkdown } from "@/components/ui/MathMarkdown";
import { Callout, Status } from "@/components/ui/primitives";
import { pendingResponses, secondsLeft } from "@/lib/assessment/sitting";
import type { SittingResponse, SittingView } from "@/lib/data/sittings";
import { ACCEPT } from "@/lib/storage/rules";
import { cn } from "@/lib/utils/cn";

const AUTOSAVE_MS = 10_000;

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function blankFor(view: SittingView): Record<string, SittingResponse> {
  const existing = new Map(view.responses.map((response) => [response.questionId, response]));
  return Object.fromEntries(
    view.questions.map((question) => [
      question.id,
      existing.get(question.id) ?? {
        questionId: question.id,
        selectedOption: null,
        answerText: question.parts.length ? question.parts.map((part) => `(${part.label}) `).join("\n\n") : "",
        photoPaths: [],
      },
    ]),
  );
}

export function SittingRunner({ view, serverNow, learnerId }: { view: SittingView; serverNow: string; learnerId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, SittingResponse>>(() => blankFor(view));
  const [imageUrls, setImageUrls] = useState(view.imageUrls);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [handedIn, setHandedIn] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  // Question ids changed on this device and not yet saved. Only these are ever sent.
  const dirty = useRef(new Set<string>());
  const saving = useRef(false);
  const submitting = useRef(false);
  const last = useRef<(() => void) | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // The server's clock decides; this offset corrects for a device clock that is wrong.
  const skew = useMemo(() => Date.parse(serverNow) - Date.now(), [serverNow]);
  const running = view.state === "in_progress" && !handedIn;
  const [left, setLeft] = useState(() =>
    view.sitting ? secondsLeft(view.sitting.startedAt, view.durationMinutes, new Date(Date.now() + skew)) : 0,
  );

  /** Takes the changed answers out of the dirty set; `restore` puts them back if the save fails. */
  const takePending = useCallback(() => {
    const ids = new Set(dirty.current);
    dirty.current.clear();
    return {
      payload: { assessmentId: view.assessmentId, responses: pendingResponses(answersRef.current, ids) },
      restore: () => ids.forEach((id) => dirty.current.add(id)),
    };
  }, [view.assessmentId]);

  const flush = useCallback(async () => {
    if (dirty.current.size === 0 || saving.current || submitting.current) return;
    saving.current = true;
    const pending = takePending();
    setSave({ kind: "saving" });
    const result = await autosaveAction(pending.payload);
    saving.current = false;
    if (result.ok) {
      setSave({ kind: "saved", at: new Date(result.savedAt).toLocaleTimeString("en-GB") });
    } else {
      pending.restore();
      setSave({ kind: "error", message: result.error });
    }
  }, [takePending]);

  const handIn = useCallback(
    (automatic: boolean) => {
      if (submitting.current) return;
      last.current = () => handInRef.current(automatic);
      submitting.current = true;
      const pending = takePending();
      startTransition(async () => {
        const result = await submitSittingAction({ ...pending.payload, automatic });
        if (result.ok) {
          setHandedIn(result.note ?? (automatic ? "Time is up. Your paper has been handed in." : "Handed in. Well done."));
          router.refresh();
        } else {
          pending.restore();
          submitting.current = false;
          setProblem(result.error);
        }
      });
    },
    [takePending, router],
  );
  const handInRef = useRef(handIn);
  handInRef.current = handIn;

  useEffect(() => {
    if (!running || !view.sitting) return;
    const tick = window.setInterval(() => {
      const next = secondsLeft(view.sitting!.startedAt, view.durationMinutes, new Date(Date.now() + skew));
      setLeft(next);
      if (next === 0) handIn(true);
    }, 1000);
    const autosave = window.setInterval(() => void flush(), AUTOSAVE_MS);
    const onHide = () => document.visibilityState === "hidden" && void flush();
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty.current.size > 0) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(autosave);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [running, view.sitting, view.durationMinutes, skew, flush, handIn]);

  const change = (questionId: string, patch: Partial<SittingResponse>) => {
    dirty.current.add(questionId);
    setAnswers((current) => ({ ...current, [questionId]: { ...current[questionId]!, ...patch } }));
  };

  const upload = async (questionId: string, file: File) => {
    last.current = () => void upload(questionId, file);
    setUploadingFor(questionId);
    setProblem(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadWorkingAction(form);
    setUploadingFor(null);
    if (!result.ok) return setProblem(result.error);
    setImageUrls((current) => ({ ...current, [result.path]: result.url }));
    change(questionId, { photoPaths: [...(answersRef.current[questionId]?.photoPaths ?? []), result.path] });
  };

  // ------------------------------------------------------------ not started
  if (view.state === "scheduled") {
    return (
      <div className="surface mx-auto max-w-xl space-y-4 p-6 text-center">
        <h1 className="font-display text-title font-semibold text-primary">{view.title}</h1>
        <p className="text-[0.9375rem] text-secondary tabular">
          {view.durationMinutes} minutes - {view.totalMarks} marks
        </p>
        <p className="text-caption text-muted">
          The timer starts when you press Start and keeps running if you close the page. Answers save every few seconds.
          When time is up the paper is handed in for you.
        </p>
        {view.paperUrl && (
          <a href={view.paperUrl} target="_blank" rel="noreferrer noopener" className="btn-secondary pressable inline-flex">
            <ExternalLink aria-hidden="true" className="size-4" strokeWidth={2} />
            Open the paper
          </a>
        )}
        <div className="flex justify-center">
          <ActionButton
            type="button"
            pending={pending}
            pendingLabel="Starting"
            icon={<Play aria-hidden="true" className="size-4" strokeWidth={2} />}
            onClick={() =>
              (last.current = () => startTransition(async () => {
                const result = await startSittingAction(view.assessmentId);
                if (result.ok) router.refresh();
                else setProblem(result.error);
              }))()
            }
          >
            Start
          </ActionButton>
        </div>
        <WriteError error={problem} onRetry={() => { setProblem(null); last.current?.(); }} pending={pending} />
      </div>
    );
  }

  const readOnly = !running;
  const lowTime = running && left <= 300;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-subtle bg-page/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-panel sm:border">
        <div className="min-w-0">
          <h1 className="truncate text-heading font-semibold text-primary">{view.title}</h1>
          <p className="text-caption text-muted tabular">{view.totalMarks} marks</p>
        </div>
        {running ? (
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium tabular",
                lowTime ? "border-warning/50 bg-warning-soft text-warning-text" : "border-subtle bg-card text-primary",
              )}
              aria-label={`${Math.ceil(left / 60)} minutes left`}
            >
              <Timer aria-hidden="true" className="size-4" strokeWidth={2} />
              {clock(left)}
            </span>
            <span className="sr-only" role="status" aria-live="polite">
              {left === 300 ? "Five minutes left" : left === 60 ? "One minute left" : ""}
            </span>
          </div>
        ) : view.state === "marked" ? (
          <Status tone="success">
            Marked{view.result?.score !== null && view.result?.score !== undefined ? ` - ${view.result.score}%` : ""}
          </Status>
        ) : (
          <Status tone="info">Handed in</Status>
        )}
      </header>

      {handedIn && (
        <Callout tone="success" title="Paper handed in">
          {handedIn}
        </Callout>
      )}
      {!handedIn && view.state === "handed_in" && (
        <Callout tone="info" title="Handed in">
          This paper is waiting to be marked. Your answers are below.
        </Callout>
      )}
      {view.state === "marked" && view.result?.feedback && (
        <Callout tone="info" title="Feedback">
          {view.result.feedback}
        </Callout>
      )}

      {view.paperUrl && (
        <a href={view.paperUrl} target="_blank" rel="noreferrer noopener" className="btn-secondary pressable inline-flex">
          <ExternalLink aria-hidden="true" className="size-4" strokeWidth={2} />
          Open the paper
        </a>
      )}

      <ol className="space-y-4">
        {view.questions.map((question) => {
          const answer = answers[question.id]!;
          const mark = view.result?.marks[question.id];
          return (
            <li key={question.id} className="surface space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-caption font-medium text-muted tabular">Question {question.number}</p>
                <span className="chip tabular">
                  {mark ? `${mark.awarded} / ` : ""}
                  {question.marks} {question.marks === 1 ? "mark" : "marks"}
                </span>
              </div>
              <MathMarkdown>{question.prompt}</MathMarkdown>
              {question.imagePaths.map((path) =>
                imageUrls[path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={path} src={imageUrls[path]} alt={`Diagram for question ${question.number}`} className="max-h-80 rounded-lg border border-subtle" />
                ) : null,
              )}
              {question.parts.length > 0 && (
                <ol className="space-y-1.5">
                  {question.parts.map((part) => (
                    <li key={part.label} className="flex gap-2">
                      <span className="font-medium text-primary">({part.label})</span>
                      <MathMarkdown className="min-w-0 flex-1">{part.prompt}</MathMarkdown>
                      <span className="shrink-0 text-caption text-muted tabular">[{part.marks}]</span>
                    </li>
                  ))}
                </ol>
              )}

              {question.options.length > 0 ? (
                <fieldset disabled={readOnly}>
                  <legend className="sr-only">Choose one answer for question {question.number}</legend>
                  <div className="space-y-1.5">
                    {question.options.map((option) => (
                      <label
                        key={option.letter}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5",
                          answer.selectedOption === option.letter ? "border-accent bg-accent-soft" : "border-subtle bg-card",
                        )}
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          checked={answer.selectedOption === option.letter}
                          onChange={() => change(question.id, { selectedOption: option.letter as SittingResponse["selectedOption"] })}
                          className="mt-1 size-4"
                        />
                        <span className="font-medium text-primary">{option.letter}</span>
                        <MathMarkdown className="min-w-0 flex-1">{option.text}</MathMarkdown>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <label className="block">
                  <span className="sr-only">Your answer to question {question.number}</span>
                  <textarea
                    value={answer.answerText}
                    readOnly={readOnly}
                    onChange={(event) => change(question.id, { answerText: event.target.value })}
                    rows={question.parts.length ? Math.max(4, question.parts.length * 3) : 4}
                    maxLength={20000}
                    placeholder="Write your answer"
                    className="field"
                  />
                </label>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {answer.photoPaths.map((path) => (
                  <span key={path} className="relative">
                    {imageUrls[path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrls[path]} alt="Your working" className="h-16 w-16 rounded-lg border border-subtle object-cover" />
                    ) : (
                      <span className="grid h-16 w-16 place-items-center rounded-lg border border-subtle text-caption text-muted">photo</span>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => change(question.id, { photoPaths: answer.photoPaths.filter((item) => item !== path) })}
                        className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-subtle bg-card text-secondary"
                      >
                        <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </span>
                ))}
                {!readOnly && question.options.length === 0 && answer.photoPaths.length < 6 && (
                  <label className={cn("btn-ghost pressable cursor-pointer", uploadingFor === question.id && "opacity-60")}>
                    <Camera aria-hidden="true" className="size-4" strokeWidth={2} />
                    {uploadingFor === question.id ? "Uploading" : "Add a photo of your working"}
                    <input
                      type="file"
                      accept={ACCEPT}
                      capture="environment"
                      disabled={uploadingFor !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void upload(question.id, file);
                      }}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>

              {mark?.feedback && <p className="text-caption text-secondary">Feedback: {mark.feedback}</p>}
            </li>
          );
        })}
      </ol>

      {running && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-page/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-panel sm:border">
          <span className="text-caption tabular">
            {save.kind === "error" ? (
              <WriteError error={save.message} onRetry={() => void flush()} />
            ) : (
              <span role="status" aria-live="polite" className="text-muted">
                {save.kind === "saving" ? "Saving..." : save.kind === "saved" ? `Saved at ${save.at}` : "Answers save every 10 seconds"}
              </span>
            )}
          </span>
          {learnerId && <MoreTimeButton learnerId={learnerId} assessmentId={view.assessmentId} extraMinutes={view.extraMinutes} />}
          <ActionButton
            type="button"
            pending={pending}
            pendingLabel="Handing in"
            icon={<Send aria-hidden="true" className="size-4" strokeWidth={2} />}
            onClick={() => {
              if (window.confirm("Hand in your paper? You cannot change answers after this.")) handIn(false);
            }}
          >
            Hand in
          </ActionButton>
        </div>
      )}

      <WriteError error={problem} onRetry={() => { setProblem(null); last.current?.(); }} pending={pending} />
      {!running && view.state !== "marked" && (
        <p className="flex items-center gap-1.5 text-caption text-secondary">
          <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={2} />
          Your answers are saved with the paper.
        </p>
      )}
    </div>
  );
}
