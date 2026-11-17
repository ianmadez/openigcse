"use client";

import { ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  deleteQuestionAction,
  saveQuestionAction,
  uploadQuestionImageAction,
} from "@/app/(parent)/parent/(gated)/questions/actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { MathMarkdown } from "@/components/ui/MathMarkdown";
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  KIND_LABEL,
  OPTION_LETTERS,
  QUESTION_KINDS,
  TIERS,
  type QuestionInput,
  type QuestionKind,
} from "@/lib/assessment/question";
import type { ObjectiveTree } from "@/lib/data/question-bank";
import { ACCEPT } from "@/lib/storage/rules";
import { cn } from "@/lib/utils/cn";

type Props = {
  initial: (QuestionInput & { id: string; imageUrls: Record<string, string>; usedIn: number }) | null;
  tree: ObjectiveTree;
  assessmentObjectives: Array<{ id: string; code: string; name: string; versionId: string }>;
};

type Message = { ok: true; message?: string } | { ok: false; error: string } | null;

function locate(tree: ObjectiveTree, objectiveId: string | null) {
  for (const subject of tree) {
    for (const topic of subject.topics) {
      if (topic.objectives.some((objective) => objective.id === objectiveId)) {
        return { subject: subject.subjectCode, topic: topic.code };
      }
    }
  }
  return { subject: tree[0]?.subjectCode ?? "", topic: tree[0]?.topics[0]?.code ?? "" };
}

const BLANK: QuestionInput = {
  kind: "ShortAnswer",
  objectiveId: "",
  assessmentObjectiveId: null,
  tier: "Both",
  difficulty: "Standard",
  prompt: "",
  options: [
    { letter: "A", text: "" },
    { letter: "B", text: "" },
    { letter: "C", text: "" },
    { letter: "D", text: "" },
  ],
  correctOption: null,
  parts: [{ label: "a", prompt: "", marks: 1 }],
  marks: 1,
  modelAnswer: "",
  markScheme: "",
  imagePaths: [],
};

export function QuestionEditor({ initial, tree, assessmentObjectives }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState<QuestionInput>(() => {
    if (!initial) return BLANK;
    const { imageUrls: _urls, usedIn: _used, ...rest } = initial;
    return {
      ...rest,
      options: rest.options.length ? rest.options : BLANK.options,
      parts: rest.parts.length ? rest.parts : BLANK.parts,
    };
  });
  const [imageUrls, setImageUrls] = useState<Record<string, string>>(initial?.imageUrls ?? {});

  const start = locate(tree, question.objectiveId);
  const [subjectCode, setSubjectCode] = useState(start.subject);
  const [topicCode, setTopicCode] = useState(start.topic);

  const subject = tree.find((item) => item.subjectCode === subjectCode);
  const topic = subject?.topics.find((item) => item.code === topicCode);
  const aoOptions = assessmentObjectives.filter((ao) => ao.versionId === subject?.versionId);

  const update = (patch: Partial<QuestionInput>) => setQuestion((current) => ({ ...current, ...patch }));

  const structuredTotal = useMemo(() => question.parts.reduce((sum, part) => sum + (part.marks || 0), 0), [question.parts]);

  const payload = (): QuestionInput => ({
    ...question,
    ...(initial ? { id: initial.id } : {}),
    options: question.kind === "MCQ" ? question.options.filter((option, index) => index < 2 || option.text.trim()) : [],
    parts: question.kind === "Structured" ? question.parts : [],
    correctOption: question.kind === "MCQ" ? question.correctOption : null,
  });

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveQuestionAction(payload());
      setMessage(result);
      if (result.ok && !initial) router.replace(`/parent/questions/${result.id}?saved=1`);
      else if (result.ok) router.refresh();
    });
  };

  const remove = () => {
    if (!initial || !window.confirm("Delete this question from the bank?")) return;
    startTransition(async () => {
      const result = await deleteQuestionAction(initial.id);
      if (result.ok) router.replace("/parent/questions");
      else setMessage(result);
    });
  };

  const upload = async (file: File) => {
    setUploading(true);
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadQuestionImageAction(form);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    if (!result.ok) return setMessage(result);
    update({ imagePaths: [...question.imagePaths, result.path] });
    setImageUrls((current) => ({ ...current, [result.path]: result.url }));
  };

  const selectClass = "field mt-1.5";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="surface space-y-4 p-4"
      >
        <fieldset>
          <legend className="label">Kind</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {QUESTION_KINDS.map((kind) => (
              <label
                key={kind}
                className={cn(
                  "cursor-pointer rounded-lg border px-2.5 py-2 text-center text-caption",
                  question.kind === kind ? "border-accent bg-accent-soft text-accent-text" : "border-subtle bg-card text-secondary",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  checked={question.kind === kind}
                  onChange={() => update({ kind: kind as QuestionKind })}
                  className="sr-only"
                />
                {KIND_LABEL[kind]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Subject</span>
            <select
              value={subjectCode}
              onChange={(event) => {
                const next = tree.find((item) => item.subjectCode === event.target.value);
                setSubjectCode(event.target.value);
                setTopicCode(next?.topics[0]?.code ?? "");
                update({ objectiveId: "", assessmentObjectiveId: null });
              }}
              className={selectClass}
            >
              {tree.map((item) => (
                <option key={item.subjectCode} value={item.subjectCode}>
                  {item.subjectCode} {item.subjectName}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Topic</span>
            <select
              value={topicCode}
              onChange={(event) => {
                setTopicCode(event.target.value);
                update({ objectiveId: "" });
              }}
              className={selectClass}
            >
              {(subject?.topics ?? []).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="label">Objective</span>
          <select
            value={question.objectiveId}
            required
            onChange={(event) => update({ objectiveId: event.target.value })}
            className={selectClass}
          >
            <option value="">Choose an objective</option>
            {(topic?.objectives ?? []).map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.code} {objective.title}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Assessment objective</span>
            <select
              value={question.assessmentObjectiveId ?? ""}
              onChange={(event) => update({ assessmentObjectiveId: event.target.value || null })}
              disabled={aoOptions.length === 0}
              className={selectClass}
            >
              <option value="">{aoOptions.length ? "Not tagged" : "None imported"}</option>
              {aoOptions.map((ao) => (
                <option key={ao.id} value={ao.id}>
                  {ao.code} {ao.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Tier</span>
            <select
              value={question.tier}
              onChange={(event) => update({ tier: event.target.value as QuestionInput["tier"] })}
              className={selectClass}
            >
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier === "Both" ? "Core and Extended" : tier}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Difficulty</span>
            <select
              value={question.difficulty}
              onChange={(event) => update({ difficulty: event.target.value as QuestionInput["difficulty"] })}
              className={selectClass}
            >
              {DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABEL[difficulty]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {aoOptions.length === 0 && (
          <p className="-mt-2 text-caption text-muted">
            This syllabus has no assessment objectives imported yet, so AO tagging waits for the curriculum import.
          </p>
        )}

        <label className="block">
          <span className="label">Question</span>
          <textarea
            value={question.prompt}
            onChange={(event) => update({ prompt: event.target.value })}
            rows={5}
            maxLength={5000}
            required
            placeholder="Markdown works. Maths goes between dollar signs: $v = \frac{d}{t}$"
            className="field mt-1.5 font-mono text-[0.8125rem]"
          />
        </label>

        <div>
          <span className="label">Diagrams</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {question.imagePaths.map((path) => (
              <span key={path} className="relative">
                {imageUrls[path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrls[path]} alt="Question diagram" className="h-16 w-16 rounded-lg border border-subtle object-cover" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-lg border border-subtle text-caption text-muted">image</span>
                )}
                <button
                  type="button"
                  onClick={() => update({ imagePaths: question.imagePaths.filter((item) => item !== path) })}
                  aria-label="Remove diagram"
                  className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-subtle bg-card text-secondary"
                >
                  <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
                </button>
              </span>
            ))}
            {question.imagePaths.length < 4 && (
              <label className={cn("btn-secondary pressable cursor-pointer", uploading && "opacity-60")}>
                <ImagePlus aria-hidden="true" className="size-4" strokeWidth={2} />
                {uploading ? "Uploading" : "Add diagram"}
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT.split(",").filter((type) => type.startsWith("image/")).join(",")}
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                  }}
                  className="sr-only"
                />
              </label>
            )}
          </div>
        </div>

        {question.kind === "MCQ" && (
          <fieldset>
            <legend className="label">Options (pick the correct one)</legend>
            <div className="mt-1.5 space-y-1.5">
              {question.options.map((option, index) => (
                <div key={option.letter} className="flex items-center gap-2">
                  <label className="flex shrink-0 items-center gap-1.5 text-[0.875rem] font-medium text-primary">
                    <input
                      type="radio"
                      name="correct"
                      checked={question.correctOption === option.letter}
                      onChange={() => update({ correctOption: option.letter })}
                      className="size-4"
                    />
                    {option.letter}
                  </label>
                  <input
                    value={option.text}
                    maxLength={500}
                    placeholder={index < 2 ? "Required" : "Optional"}
                    onChange={(event) =>
                      update({
                        options: question.options.map((item) =>
                          item.letter === option.letter ? { ...item, text: event.target.value } : item,
                        ),
                      })
                    }
                    className="field"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {question.kind === "Structured" && (
          <fieldset>
            <legend className="label">Parts ({structuredTotal} marks in total)</legend>
            <div className="mt-1.5 space-y-2">
              {question.parts.map((part, index) => (
                <div key={index} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_auto] items-start gap-2">
                  <input
                    value={part.label}
                    maxLength={8}
                    aria-label="Part label"
                    onChange={(event) =>
                      update({ parts: question.parts.map((item, at) => (at === index ? { ...item, label: event.target.value } : item)) })
                    }
                    className="field px-2 text-center"
                  />
                  <textarea
                    value={part.prompt}
                    rows={2}
                    maxLength={2000}
                    aria-label={`Part ${part.label}`}
                    onChange={(event) =>
                      update({ parts: question.parts.map((item, at) => (at === index ? { ...item, prompt: event.target.value } : item)) })
                    }
                    className="field"
                  />
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={part.marks}
                    aria-label={`Marks for part ${part.label}`}
                    onChange={(event) =>
                      update({
                        parts: question.parts.map((item, at) => (at === index ? { ...item, marks: Number(event.target.value) || 1 } : item)),
                      })
                    }
                    className="field tabular"
                  />
                  <button
                    type="button"
                    aria-label={`Remove part ${part.label}`}
                    disabled={question.parts.length === 1}
                    onClick={() => update({ parts: question.parts.filter((_, at) => at !== index) })}
                    className="btn-ghost pressable px-2"
                  >
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
            {question.parts.length < 10 && (
              <button
                type="button"
                onClick={() =>
                  update({
                    parts: [...question.parts, { label: String.fromCharCode(97 + question.parts.length), prompt: "", marks: 1 }],
                  })
                }
                className="btn-ghost pressable mt-2"
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                Add part
              </button>
            )}
          </fieldset>
        )}

        {question.kind !== "Structured" && (
          <label className="block w-32">
            <span className="label">Marks</span>
            <input
              type="number"
              min={1}
              max={50}
              value={question.marks}
              onChange={(event) => update({ marks: Number(event.target.value) || 1 })}
              className="field mt-1.5 tabular"
            />
          </label>
        )}

        {question.kind !== "MCQ" && (
          <label className="block">
            <span className="label">Model answer{question.kind === "Structured" ? " (optional)" : ""}</span>
            <textarea
              value={question.modelAnswer}
              onChange={(event) => update({ modelAnswer: event.target.value })}
              rows={3}
              maxLength={5000}
              className="field mt-1.5"
            />
          </label>
        )}

        <label className="block">
          <span className="label">Marking guide{question.kind === "MCQ" ? " (optional)" : ""}</span>
          <textarea
            value={question.markScheme}
            onChange={(event) => update({ markScheme: event.target.value })}
            rows={3}
            maxLength={5000}
            placeholder="What earns each mark, and common answers that do not."
            className="field mt-1.5"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <ActionButton pending={pending} pendingLabel="Saving" icon={<Save aria-hidden="true" className="size-4" strokeWidth={2} />}>
            Save question
          </ActionButton>
          {initial && (
            <ActionButton
              type="button"
              variant="ghost"
              pending={pending}
              onClick={remove}
              icon={<Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />}
            >
              Delete
            </ActionButton>
          )}
          <FormMessage result={message} />
        </div>
        {initial && initial.usedIn > 0 && (
          <p className="text-caption text-muted">
            On {initial.usedIn} assessment{initial.usedIn === 1 ? "" : "s"}. Edits change those papers too; it cannot be deleted
            while in use.
          </p>
        )}
      </form>

      <aside aria-label="Preview" className="surface h-fit space-y-3 p-4 lg:sticky lg:top-20">
        <p className="label">Preview</p>
        {question.prompt.trim() ? (
          <MathMarkdown>{question.prompt}</MathMarkdown>
        ) : (
          <p className="text-caption text-muted">The question appears here as the learner will see it.</p>
        )}
        {question.imagePaths.map((path) =>
          imageUrls[path] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={path} src={imageUrls[path]} alt="Question diagram" className="max-h-64 rounded-lg border border-subtle" />
          ) : null,
        )}
        {question.kind === "MCQ" && (
          <ul className="space-y-1.5">
            {question.options
              .filter((option) => option.text.trim())
              .map((option) => (
                <li key={option.letter} className="flex gap-2 rounded-lg border border-subtle bg-card px-2.5 py-1.5">
                  <span className="font-medium text-primary">{option.letter}</span>
                  <MathMarkdown className="min-w-0 flex-1">{option.text}</MathMarkdown>
                </li>
              ))}
          </ul>
        )}
        {question.kind === "Structured" && (
          <ol className="space-y-2">
            {question.parts.map((part, index) => (
              <li key={index} className="flex gap-2">
                <span className="font-medium text-primary">({part.label})</span>
                <MathMarkdown className="min-w-0 flex-1">{part.prompt || " "}</MathMarkdown>
                <span className="shrink-0 text-caption text-muted tabular">[{part.marks}]</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-caption text-muted tabular">
          [{question.kind === "Structured" ? structuredTotal : question.marks} mark
          {(question.kind === "Structured" ? structuredTotal : question.marks) === 1 ? "" : "s"}]
        </p>
      </aside>
    </div>
  );
}
