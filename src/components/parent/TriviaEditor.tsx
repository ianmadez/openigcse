"use client";

import { Clapperboard, PencilLine, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteTriviaModuleAction, saveTriviaModuleAction } from "@/app/(parent)/parent/(gated)/trivia/actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { EmptyState, Panel, Status } from "@/components/ui/primitives";
import type { TriviaEditorModule } from "@/lib/data/trivia";
import {
  TRIVIA_LETTERS,
  formatTimestamp,
  parseTimestamp,
  triviaInputFromModule,
  type TriviaLetter,
  type TriviaModuleInput,
} from "@/lib/trivia/module";
import { cn } from "@/lib/utils/cn";

type Draft = {
  id?: string;
  title: string;
  topicArea: string;
  provider: string;
  youtubeVideoId: string;
  description: string;
  durationMinutes: string;
  isPublished: boolean;
  checkpoints: CheckpointDraft[];
};

type CheckpointDraft = {
  at: string;
  prompt: string;
  options: Record<TriviaLetter, string>;
  correct: TriviaLetter;
  explanation: string;
};

type Result = { ok: true; message?: string } | { ok: false; error: string } | null;

function emptyCheckpoint(): CheckpointDraft {
  return { at: "", prompt: "", options: { A: "", B: "", C: "", D: "" }, correct: "A", explanation: "" };
}

function blankDraft(): Draft {
  return {
    title: "",
    topicArea: "",
    provider: "",
    youtubeVideoId: "",
    description: "",
    durationMinutes: "",
    isPublished: true,
    checkpoints: [emptyCheckpoint()],
  };
}

function draftFrom(module: TriviaEditorModule): Draft {
  const input = triviaInputFromModule(module);
  return {
    id: module.id,
    title: input.title,
    topicArea: input.topicArea,
    provider: input.provider,
    youtubeVideoId: input.youtubeVideoId,
    description: input.description,
    durationMinutes: input.durationMinutes == null ? "" : String(input.durationMinutes),
    isPublished: input.isPublished,
    checkpoints: input.checkpoints.map((checkpoint) => {
      const options: Record<TriviaLetter, string> = { A: "", B: "", C: "", D: "" };
      for (const option of checkpoint.options) options[option.letter] = option.text;
      return {
        at: formatTimestamp(checkpoint.atSeconds),
        prompt: checkpoint.prompt,
        options,
        correct: checkpoint.correctLetter,
        explanation: checkpoint.explanation,
      };
    }),
  };
}

/** Turns the form into the payload the action validates. Blocks a save the server would refuse. */
function toPayload(draft: Draft): { ok: true; input: TriviaModuleInput } | { ok: false; error: string } {
  const checkpoints = [];

  for (const [index, checkpoint] of draft.checkpoints.entries()) {
    const atSeconds = parseTimestamp(checkpoint.at);
    if (atSeconds === null) return { ok: false, error: `Checkpoint ${index + 1}: use a timestamp like 2:35.` };

    const options = TRIVIA_LETTERS.flatMap((letter) =>
      checkpoint.options[letter].trim() ? [{ letter, text: checkpoint.options[letter].trim() }] : [],
    );
    if (options.length < 2) return { ok: false, error: `Checkpoint ${index + 1}: write at least two answers.` };
    if (!options.some((option) => option.letter === checkpoint.correct)) {
      return { ok: false, error: `Checkpoint ${index + 1}: the marked answer has no text.` };
    }

    checkpoints.push({
      atSeconds,
      prompt: checkpoint.prompt,
      options,
      correctLetter: checkpoint.correct,
      explanation: checkpoint.explanation,
    });
  }

  const duration = draft.durationMinutes.trim() ? Number(draft.durationMinutes) : null;
  if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
    return { ok: false, error: "The duration has to be a number of minutes." };
  }

  return {
    ok: true,
    input: {
      id: draft.id,
      title: draft.title,
      topicArea: draft.topicArea,
      provider: draft.provider,
      youtubeVideoId: draft.youtubeVideoId,
      description: draft.description,
      durationMinutes: duration,
      isPublished: draft.isPublished,
      checkpoints,
    },
  };
}

export function TriviaEditor({ modules }: { modules: TriviaEditorModule[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  const areas = [...new Set(modules.map((module) => module.topicArea))];

  const change = (part: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...part } : current));

  const changeCheckpoint = (index: number, part: Partial<CheckpointDraft>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            checkpoints: current.checkpoints.map((checkpoint, position) =>
              position === index ? { ...checkpoint, ...part } : checkpoint,
            ),
          }
        : current,
    );

  const addCheckpoint = () =>
    setDraft((current) => (current ? { ...current, checkpoints: [...current.checkpoints, emptyCheckpoint()] } : current));

  const removeCheckpoint = (index: number) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            checkpoints:
              current.checkpoints.length === 1
                ? [emptyCheckpoint()]
                : current.checkpoints.filter((_, position) => position !== index),
          }
        : current,
    );

  const save = () => {
    if (!draft) return;
    const payload = toPayload(draft);
    if (!payload.ok) {
      setResult({ ok: false, error: payload.error });
      return;
    }

    setResult(null);
    startTransition(async () => {
      const saved = await saveTriviaModuleAction(payload.input).catch(() => ({
        ok: false as const,
        error: "The server could not be reached.",
      }));
      setResult(saved);
      if (saved.ok) {
        router.refresh();
        setDraft((current) => (current && current.id ? { ...current, id: saved.id } : blankDraft()));
      }
    });
  };

  const removeModule = (module: TriviaEditorModule) => {
    if (!window.confirm(`Delete "${module.title}" and its checkpoints?`)) return;
    setResult(null);
    startTransition(async () => {
      const deleted = await deleteTriviaModuleAction(module.id).catch(() => ({
        ok: false as const,
        error: "The server could not be reached.",
      }));
      setResult(deleted);
      if (deleted.ok) {
        if (draft?.id === module.id) setDraft(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Your modules"
        description="Published modules show on the learner's Trivia page; drafts stay here."
        action={
          <button type="button" onClick={() => setDraft(blankDraft())} className="btn-primary pressable shrink-0 whitespace-nowrap">
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.2} />
            New module
          </button>
        }
      >
        {modules.length === 0 ? (
          <EmptyState title="No modules yet">Add one with a video id and at least one checkpoint.</EmptyState>
        ) : (
          <ul className="divide-y divide-subtle">
            {modules.map((module) => (
              <li key={module.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-medium text-primary">{module.title}</span>
                  <span className="block text-caption text-muted">
                    {module.topicArea} - {module.provider || "no provider"} - {module.questions.length}{" "}
                    {module.questions.length === 1 ? "checkpoint" : "checkpoints"}
                    {module.durationMinutes ? ` - ${module.durationMinutes} min` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Status tone={module.isPublished ? "success" : "neutral"}>{module.isPublished ? "Published" : "Draft"}</Status>
                  <Link href={`/trivia/${module.id}`} className="btn-secondary pressable">
                    <Clapperboard aria-hidden="true" className="size-3.5" strokeWidth={2} />
                    Preview
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setDraft(draftFrom(module));
                    }}
                    className="btn-secondary pressable"
                    aria-label={`Edit ${module.title}`}
                  >
                    <PencilLine aria-hidden="true" className="size-3.5" strokeWidth={2} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeModule(module)}
                    disabled={pending}
                    className="btn-danger pressable"
                    aria-label={`Delete ${module.title}`}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={2} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={draft?.id ? "Edit module" : "New module"}
        description={draft ? "Every checkpoint is asked at the timestamp you give it." : "Start one with New module."}
        action={
          draft ? (
            <button type="button" onClick={() => setDraft(null)} className="btn-ghost pressable">
              <X aria-hidden="true" className="size-4" strokeWidth={2} />
              Close
            </button>
          ) : undefined
        }
      >
        {!draft ? (
          <p className="text-caption text-secondary">
            Pick a module to edit, or start a new one. A module needs a YouTube id (the 11 characters after{" "}
            <span className="tabular">watch?v=</span>) and at least one checkpoint.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="label">Title</span>
                <input
                  value={draft.title}
                  onChange={(event) => change({ title: event.target.value })}
                  className="field mt-1.5"
                  placeholder="The deep ocean"
                />
              </label>

              <label className="block">
                <span className="label">Area</span>
                <input
                  value={draft.topicArea}
                  onChange={(event) => change({ topicArea: event.target.value })}
                  list="trivia-areas"
                  className="field mt-1.5"
                  placeholder="Oceanography"
                />
                <datalist id="trivia-areas">
                  {areas.map((area) => (
                    <option key={area} value={area} />
                  ))}
                </datalist>
              </label>

              <label className="block">
                <span className="label">Provider</span>
                <input
                  value={draft.provider}
                  onChange={(event) => change({ provider: event.target.value })}
                  className="field mt-1.5"
                  placeholder="BBC Earth"
                />
              </label>

              <label className="block">
                <span className="label">YouTube id</span>
                <input
                  value={draft.youtubeVideoId}
                  onChange={(event) => change({ youtubeVideoId: event.target.value })}
                  className="field mt-1.5 tabular"
                  placeholder="dQw4w9WgXcQ"
                  maxLength={11}
                />
              </label>

              <label className="block">
                <span className="label">Duration (minutes)</span>
                <input
                  value={draft.durationMinutes}
                  onChange={(event) => change({ durationMinutes: event.target.value })}
                  inputMode="numeric"
                  className="field mt-1.5 tabular"
                  placeholder="12"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="label">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(event) => change({ description: event.target.value })}
                  rows={2}
                  className="field mt-1.5"
                  placeholder="What the film covers, in one or two lines."
                />
              </label>

              <label className="flex items-center gap-2.5 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(event) => change({ isPublished: event.target.checked })}
                  className="size-4"
                />
                <span className="text-[0.875rem] text-secondary">Published to the learner&apos;s Trivia page</span>
              </label>
            </div>

            <div className="space-y-3">
              {draft.checkpoints.map((checkpoint, index) => (
                <fieldset key={index} className="rounded-panel border border-subtle bg-sunken p-3">
                  <legend className="px-1 text-caption font-semibold text-primary">Checkpoint {index + 1}</legend>

                  <div className="grid gap-2.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
                    <label className="block">
                      <span className="label">At</span>
                      <input
                        value={checkpoint.at}
                        onChange={(event) => changeCheckpoint(index, { at: event.target.value })}
                        className="field mt-1 tabular"
                        placeholder="2:35"
                      />
                    </label>

                    <label className="block">
                      <span className="label">Question</span>
                      <input
                        value={checkpoint.prompt}
                        onChange={(event) => changeCheckpoint(index, { prompt: event.target.value })}
                        className="field mt-1"
                        placeholder="What lives below 3000 m?"
                      />
                    </label>
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    {TRIVIA_LETTERS.map((letter) => (
                      <label key={letter} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${index}`}
                          checked={checkpoint.correct === letter}
                          onChange={() => changeCheckpoint(index, { correct: letter })}
                          aria-label={`Mark ${letter} as the correct answer`}
                        />
                        <span className="w-4 text-caption font-semibold text-secondary tabular">{letter}</span>
                        <input
                          value={checkpoint.options[letter]}
                          onChange={(event) =>
                            changeCheckpoint(index, { options: { ...checkpoint.options, [letter]: event.target.value } })
                          }
                          className={cn("field flex-1 py-1.5", checkpoint.correct === letter && "border-accent-line")}
                          placeholder={letter <= "B" ? "Answer text (required)" : "Optional answer"}
                        />
                      </label>
                    ))}
                  </div>

                  <label className="mt-2.5 block">
                    <span className="label">Shown after answering</span>
                    <input
                      value={checkpoint.explanation}
                      onChange={(event) => changeCheckpoint(index, { explanation: event.target.value })}
                      className="field mt-1"
                      placeholder="Why that answer is right"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeCheckpoint(index)}
                    className="btn-ghost pressable mt-2 text-danger-text"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={2} />
                    Remove checkpoint
                  </button>
                </fieldset>
              ))}

              <button type="button" onClick={addCheckpoint} className="btn-secondary pressable">
                <Plus aria-hidden="true" className="size-4" strokeWidth={2.2} />
                Add checkpoint
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ActionButton
                type="button"
                pending={pending}
                pendingLabel="Saving"
                onClick={save}
                icon={<Save aria-hidden="true" className="size-4" strokeWidth={2.2} />}
              >
                {draft.id ? "Save changes" : "Publish module"}
              </ActionButton>
              <FormMessage result={result} />
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
