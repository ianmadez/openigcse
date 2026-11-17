"use client";

import { ArrowDown, ArrowUp, Check, CircleDot, Clock, Play } from "lucide-react";
import { useState } from "react";

import { SandboxedVideoPlayer } from "@/components/player/SandboxedVideoPlayer";
import { StuckButton } from "@/components/student/StuckButton";
import { StudyTimer } from "@/components/student/StudyTimer";
import { EmptyState } from "@/components/ui/primitives";
import type { Checkpoint, LessonResource } from "@/lib/data/workspace";
import type { PlannedTask } from "@/lib/planning/nextBestActivity";
import { cn } from "@/lib/utils/cn";

type StudyBlockProps = {
  tasks: PlannedTask[];
  checkpoints: Checkpoint[];
  resources: LessonResource[];
};

const actionLabel = {
  review: "Review mistakes",
  learn: "Learn this",
  practice: "Practise",
} as const;

export function StudyBlock({ tasks, checkpoints, resources }: StudyBlockProps) {
  const [order, setOrder] = useState(tasks);
  const [activeCode, setActiveCode] = useState(tasks[0]?.objectiveCode ?? null);
  const [done, setDone] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  const active = order.find((task) => task.objectiveCode === activeCode) ?? null;
  const checkpoint = active ? checkpoints.find((item) => item.objectiveCode === active.objectiveCode) : null;
  const lesson = active ? resources.find((item) => item.objectiveCode === active.objectiveCode) : null;

  const move = (index: number, direction: -1 | 1) => {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const current = next[index]!;
    next[index] = next[target]!;
    next[target] = current;
    setOrder(next);
  };

  const choose = (code: string) => {
    setActiveCode(code);
    setSelected(null);
    setAnswer(null);
  };

  if (order.length === 0) {
    return (
      <EmptyState title="Nothing is queued">
        The queue is built from enrolled objectives. Once a subject is enrolled on this term, its objectives appear
        here.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="surface p-4" aria-labelledby="queue-heading">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 id="queue-heading" className="text-heading font-semibold text-primary">
            Study next
          </h2>
          <span className="text-caption text-muted">Ranked, not fixed</span>
        </div>

        <ol className="space-y-1.5">
          {order.map((task, index) => {
            const isActive = task.objectiveCode === activeCode;
            const isDone = done.includes(task.objectiveCode);

            return (
              <li key={task.objectiveCode}>
                <div
                  className={cn(
                    "rounded-panel border p-3",
                    isActive ? "border-accent-line bg-accent-soft" : "border-subtle bg-card",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => choose(task.objectiveCode)}
                      aria-pressed={isActive}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold tabular",
                          isDone
                            ? "border-success/50 bg-success-soft text-success-text"
                            : isActive
                              ? "border-accent bg-accent text-on-accent"
                              : "border-strong/60 text-muted",
                        )}
                      >
                        {isDone ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                      </span>

                      <span className="min-w-0">
                        <span className="block text-caption text-muted">
                          {task.subjectName} - {task.topicName}
                        </span>
                        <span className="mt-0.5 block text-[0.9375rem] font-medium leading-snug text-primary">
                          {task.objectiveText}
                        </span>
                      </span>
                    </button>

                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="icon-btn size-7 disabled:opacity-30"
                        aria-label={`Move ${task.topicName} up`}
                      >
                        <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === order.length - 1}
                        className="icon-btn size-7 disabled:opacity-30"
                        aria-label={`Move ${task.topicName} down`}
                      >
                        <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  <ul className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {task.reasons.slice(0, 2).map((reason) => (
                      <li
                        key={reason}
                        className="inline-flex items-center gap-1 rounded-full border border-subtle bg-sunken px-2 py-0.5 text-[0.6875rem] text-secondary"
                      >
                        <CircleDot aria-hidden="true" className="size-2.5" strokeWidth={2.5} />
                        {reason}
                      </li>
                    ))}
                    <li className="inline-flex items-center gap-1 text-[0.6875rem] text-muted">
                      <Clock aria-hidden="true" className="size-3" strokeWidth={2} />
                      {task.minutes} min
                    </li>
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {active && (
        <section className="surface flex flex-col gap-4 p-4" aria-labelledby="active-heading">
          <div>
            <p className="label">
              {active.subjectCode} - {active.topicName}
            </p>
            <h2 id="active-heading" className="mt-1 text-heading font-semibold leading-snug text-primary">
              {active.objectiveText}
            </h2>
            <p className="mt-1.5 text-caption text-muted">
              {active.commandWord} - {active.tier} tier - {actionLabel[active.action]}
            </p>
          </div>

          {lesson && lesson.youtubeVideoId && (
            <div className="space-y-1.5">
              <SandboxedVideoPlayer
                videoId={lesson.youtubeVideoId}
                title={lesson.title}
                startSeconds={lesson.startSeconds}
                endSeconds={lesson.endSeconds}
                className="aspect-video w-full overflow-hidden rounded-panel border border-subtle bg-black"
              />
              <p className="text-caption text-muted">
                {lesson.title} - {lesson.provider} - sandboxed player
              </p>
            </div>
          )}

          {lesson && !lesson.youtubeVideoId && lesson.url && (
            <a href={lesson.url} target="_blank" rel="noreferrer noopener" className="btn-secondary pressable self-start">
              <Play aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
              Open {lesson.title}
            </a>
          )}

          <StudyTimer
            objectiveCode={active.objectiveCode}
            plannedMinutes={active.minutes}
            onRecorded={() =>
              setDone((items) => (items.includes(active.objectiveCode) ? items : [...items, active.objectiveCode]))
            }
          />

          {checkpoint ? (
            <div className="rounded-panel border border-subtle bg-card p-3">
              <p className="text-[0.8125rem] font-medium text-primary">{checkpoint.prompt}</p>

              <div role="radiogroup" aria-label="Answer options" className="mt-2.5 space-y-1.5">
                {checkpoint.options.map((option) => {
                  const chosen = selected === option.letter;
                  return (
                    <button
                      key={option.letter}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      onClick={() => {
                        setSelected(option.letter);
                        setAnswer(null);
                      }}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-[0.8125rem] leading-snug",
                        chosen
                          ? "border-accent-line bg-accent-soft text-primary"
                          : "border-subtle bg-card text-secondary",
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

              {answer === null ? (
                <button
                  type="button"
                  onClick={() => setAnswer(checkpoint.modelAnswer)}
                  disabled={!selected}
                  className="btn-primary pressable mt-2.5 w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Check answer
                </button>
              ) : (
                <div
                  role="status"
                  className={cn(
                    "mt-2.5 rounded-panel border px-3 py-2 text-caption",
                    answer === selected
                      ? "border-success/40 bg-success-soft text-success-text"
                      : "border-warning/40 bg-warning-soft text-warning-text",
                  )}
                >
                  <p className="font-semibold">
                    {answer === selected ? "Correct." : `Not quite. The answer is ${checkpoint.modelAnswer}.`}
                  </p>
                  <p className="mt-0.5">{checkpoint.markingGuide}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-panel border border-dashed border-strong/40 px-3 py-2 text-caption text-muted">
              No checkpoint is written for this objective yet. The marking desk is where they get added.
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setDone((items) => (items.includes(active.objectiveCode) ? items : [...items, active.objectiveCode]))
              }
              className="btn-secondary pressable"
            >
              <Play aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
              Mark done
            </button>
            <StuckButton objectiveCode={active.objectiveCode} />
          </div>
        </section>
      )}
    </div>
  );
}
