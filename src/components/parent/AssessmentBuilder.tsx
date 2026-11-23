"use client";

import { ArrowDown, ArrowUp, CalendarCheck, Plus, Save, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addPastPaperQuestionsAction,
  autoPickAction,
  createAssessmentAction,
  deleteAssessmentAction,
  publishAssessmentAction,
  saveAssessmentAction,
  unpublishAssessmentAction,
} from "@/app/(parent)/parent/(gated)/assessments/actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Status } from "@/components/ui/primitives";
import { ASSESSMENT_KINDS, STATE_LABEL, type SittingState } from "@/lib/assessment/builder";
import { KIND_LABEL, type QuestionKind } from "@/lib/assessment/question";
import type { ObjectiveTree } from "@/lib/data/question-bank";

type Message = { ok: true; message?: string } | { ok: false; error: string } | null;

export type BankQuestion = {
  id: string;
  kind: string;
  preview: string;
  marks: number;
  subjectCode: string | null;
  objectiveCode: string | null;
  topicName: string | null;
};

type Fields = {
  title: string;
  category: string;
  routeId: string;
  scheduledDate: string;
  durationMinutes: number;
  thresholds: Array<{ grade: string; minPercent: number | null }>;
  paperCode: string;
  examSeries: string;
  paperVariant: string;
  paperUrl: string;
};

type Props = {
  existing: (Fields & { id: string; status: string; state: SittingState; questionIds: string[] }) | null;
  subjects: Array<{ routeId: string; subjectCode: string; subjectName: string }>;
  bank: BankQuestion[];
  tree: ObjectiveTree;
  zone: number | null;
  today: string;
};

export function AssessmentBuilder({ existing, subjects, bank, tree, zone, today }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const [examDay, setExamDay] = useState(false);
  const [search, setSearch] = useState("");

  const [fields, setFields] = useState<Fields>(
    existing ?? {
      title: "",
      category: "WeeklyQuiz",
      routeId: subjects[0]?.routeId ?? "",
      scheduledDate: today,
      durationMinutes: 30,
      thresholds: [],
      paperCode: "",
      examSeries: "",
      paperVariant: "",
      paperUrl: "",
    },
  );
  const [questionIds, setQuestionIds] = useState<string[]>(existing?.questionIds ?? []);
  const [paperRows, setPaperRows] = useState<Array<{ number: string; marks: number; objectiveId: string }>>([
    { number: "1", marks: 1, objectiveId: "" },
  ]);

  const editable = !existing || existing.state === "draft" || existing.state === "scheduled";
  const subject = subjects.find((item) => item.routeId === fields.routeId);
  const bankById = useMemo(() => new Map(bank.map((question) => [question.id, question])), [bank]);
  const chosen = questionIds.map((id) => bankById.get(id)).filter((question): question is BankQuestion => Boolean(question));
  const total = chosen.reduce((sum, question) => sum + question.marks, 0);
  const subjectObjectives = (tree.find((item) => item.subjectCode === subject?.subjectCode)?.topics ?? []).flatMap(
    (topic) => topic.objectives,
  );

  const available = bank
    .filter((question) => question.subjectCode === subject?.subjectCode && !questionIds.includes(question.id))
    .filter((question) => {
      const needle = search.trim().toLowerCase();
      return !needle || `${question.preview} ${question.objectiveCode} ${question.topicName}`.toLowerCase().includes(needle);
    });

  const set = (patch: Partial<Fields>) => setFields((current) => ({ ...current, ...patch }));

  const run = (work: () => Promise<Message & object>, after?: (result: NonNullable<Message> & Record<string, unknown>) => void) => {
    setMessage(null);
    startTransition(async () => {
      const result = (await work()) as NonNullable<Message> & Record<string, unknown>;
      setMessage(result);
      if (result.ok) after?.(result);
    });
  };

  const move = (index: number, by: number) =>
    setQuestionIds((ids) => {
      const next = [...ids];
      const [item] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item!);
      return next;
    });

  const isPastPaper = fields.category === "TimedPastPaper";

  return (
    <div className="space-y-4">
      {existing && (
        <div className="flex flex-wrap items-center gap-2">
          <Status tone={existing.state === "draft" ? "neutral" : existing.state === "marked" ? "success" : "info"}>
            {STATE_LABEL[existing.state]}
          </Status>
          {!editable && (
            <span className="text-caption text-secondary">
              The learner has started this paper, so it is locked. Marking happens at the marking desk.
            </span>
          )}
        </div>
      )}

      <fieldset disabled={!editable} className="surface space-y-3 p-4">
        <legend className="px-1 text-heading font-semibold text-primary">Details</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">Title</span>
            <input value={fields.title} maxLength={120} required onChange={(event) => set({ title: event.target.value })} placeholder="Cells and transport quiz" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Kind</span>
            <select value={fields.category} onChange={(event) => set({ category: event.target.value })} className="field mt-1.5">
              {ASSESSMENT_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Subject</span>
            <select
              value={fields.routeId}
              disabled={Boolean(existing && questionIds.length)}
              onChange={(event) => set({ routeId: event.target.value })}
              className="field mt-1.5"
            >
              {subjects.map((item) => (
                <option key={item.routeId} value={item.routeId}>
                  {item.subjectCode} {item.subjectName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Date</span>
            <input type="date" value={fields.scheduledDate} onChange={(event) => set({ scheduledDate: event.target.value })} className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Minutes</span>
            <input
              type="number"
              inputMode="numeric"
              min={5}
              max={300}
              value={fields.durationMinutes}
              onChange={(event) => set({ durationMinutes: Number(event.target.value) || 0 })}
              className="field mt-1.5 tabular"
            />
          </label>
        </div>

        {isPastPaper && (
          <div className="grid gap-3 rounded-panel border border-subtle bg-sunken p-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Paper code</span>
              <input value={fields.paperCode} maxLength={20} onChange={(event) => set({ paperCode: event.target.value })} placeholder="0625/42" className="field mt-1.5" />
            </label>
            <label className="block">
              <span className="label">Series</span>
              <input value={fields.examSeries} maxLength={40} onChange={(event) => set({ examSeries: event.target.value })} placeholder="May/June 2025" className="field mt-1.5" />
            </label>
            <label className="block">
              <span className="label">Variant</span>
              <input value={fields.paperVariant} maxLength={10} onChange={(event) => set({ paperVariant: event.target.value })} placeholder="42" className="field mt-1.5" />
              <span className="mt-1 block text-caption text-muted">
                {zone ? `This household is in Cambridge administrative zone ${zone}. ` : ""}Check which variant that zone sat on
                the Cambridge timetable for the series.
              </span>
            </label>
            <label className="block">
              <span className="label">Paper PDF link</span>
              <input type="url" value={fields.paperUrl} maxLength={500} onChange={(event) => set({ paperUrl: event.target.value })} placeholder="https://" className="field mt-1.5" />
            </label>
          </div>
        )}

        <div>
          <span className="label">Grade thresholds (optional)</span>
          <p className="mt-1 text-caption text-muted">
            Type the thresholds Cambridge published for a recent series of this paper, as percentages. The marking desk uses
            them for a grade estimate; nothing is fetched or guessed.
          </p>
          <div className="mt-2 space-y-1.5">
            {fields.thresholds.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={row.grade}
                  maxLength={4}
                  aria-label="Grade"
                  placeholder="A"
                  onChange={(event) => set({ thresholds: fields.thresholds.map((item, at) => (at === index ? { ...item, grade: event.target.value } : item)) })}
                  className="field w-20"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  aria-label={`Minimum percent for ${row.grade || "grade"}`}
                  value={row.minPercent ?? ""}
                  onChange={(event) =>
                    set({
                      thresholds: fields.thresholds.map((item, at) =>
                        at === index ? { ...item, minPercent: event.target.value === "" ? null : Number(event.target.value) } : item,
                      ),
                    })
                  }
                  className="field w-24 tabular"
                />
                <span className="text-caption text-muted">% and above</span>
                <button type="button" aria-label="Remove threshold" onClick={() => set({ thresholds: fields.thresholds.filter((_, at) => at !== index) })} className="btn-ghost pressable px-2">
                  <X aria-hidden="true" className="size-4" strokeWidth={2} />
                </button>
              </div>
            ))}
            {fields.thresholds.length < 12 && (
              <button type="button" onClick={() => set({ thresholds: [...fields.thresholds, { grade: "", minPercent: null }] })} className="btn-ghost pressable">
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                Add threshold
              </button>
            )}
          </div>
        </div>
      </fieldset>

      {existing && (
        <section className="surface space-y-3 p-4" aria-labelledby="paper-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="paper-heading" className="text-heading font-semibold text-primary">
              On the paper
            </h2>
            <span className="text-caption text-secondary tabular">
              {chosen.length} {chosen.length === 1 ? "question" : "questions"}, {total} {total === 1 ? "mark" : "marks"}
            </span>
          </div>

          {chosen.length === 0 ? (
            <p className="text-caption text-secondary">No questions yet. Add them from the bank below{isPastPaper ? " or list the paper's questions" : ""}.</p>
          ) : (
            <ol className="divide-y divide-subtle rounded-panel border border-subtle">
              {chosen.map((question, index) => (
                <li key={question.id} className="flex items-start gap-2 p-3">
                  <span className="w-6 shrink-0 text-caption font-medium text-muted tabular">{index + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.875rem] text-primary">{question.preview}</span>
                    <span className="block text-caption text-muted">
                      {question.objectiveCode} - {KIND_LABEL[question.kind as QuestionKind] ?? question.kind} - {question.marks}{" "}
                      {question.marks === 1 ? "mark" : "marks"}
                    </span>
                  </span>
                  {editable && (
                    <span className="flex shrink-0 items-center">
                      <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="btn-ghost pressable px-1.5">
                        <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} />
                      </button>
                      <button type="button" aria-label="Move down" disabled={index === chosen.length - 1} onClick={() => move(index, 1)} className="btn-ghost pressable px-1.5">
                        <ArrowDown aria-hidden="true" className="size-4" strokeWidth={2} />
                      </button>
                      <button type="button" aria-label="Remove from paper" onClick={() => setQuestionIds((ids) => ids.filter((id) => id !== question.id))} className="btn-ghost pressable px-1.5">
                        <X aria-hidden="true" className="size-4" strokeWidth={2} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}

          {editable && isPastPaper && (
            <div className="rounded-panel border border-subtle bg-sunken p-3">
              <p className="label">Paper questions</p>
              <p className="mt-1 text-caption text-muted">One row per question: its number, its marks and the objective it tests.</p>
              <div className="mt-2 space-y-1.5">
                {paperRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[4rem_4.5rem_minmax(0,1fr)_auto] items-center gap-2">
                    <input aria-label="Question number" value={row.number} maxLength={10} onChange={(event) => setPaperRows((rows) => rows.map((item, at) => (at === index ? { ...item, number: event.target.value } : item)))} className="field" />
                    <input aria-label="Marks" type="number" min={1} max={50} value={row.marks} onChange={(event) => setPaperRows((rows) => rows.map((item, at) => (at === index ? { ...item, marks: Number(event.target.value) || 1 } : item)))} className="field tabular" />
                    <select aria-label="Objective" value={row.objectiveId} onChange={(event) => setPaperRows((rows) => rows.map((item, at) => (at === index ? { ...item, objectiveId: event.target.value } : item)))} className="field">
                      <option value="">Objective</option>
                      {subjectObjectives.map((objective) => (
                        <option key={objective.id} value={objective.id}>
                          {objective.code} {objective.title}
                        </option>
                      ))}
                    </select>
                    <button type="button" aria-label="Remove row" disabled={paperRows.length === 1} onClick={() => setPaperRows((rows) => rows.filter((_, at) => at !== index))} className="btn-ghost pressable px-2">
                      <X aria-hidden="true" className="size-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setPaperRows((rows) => [...rows, { number: String(rows.length + 1), marks: 1, objectiveId: "" }])} className="btn-ghost pressable">
                  <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                  Add row
                </button>
                <ActionButton
                  type="button"
                  variant="secondary"
                  pending={pending}
                  onClick={() =>
                    run(
                      () => addPastPaperQuestionsAction({ id: existing.id, rows: paperRows }),
                      (result) => {
                        setQuestionIds((ids) => [...ids, ...((result.questionIds as string[]) ?? [])]);
                        router.refresh();
                      },
                    )
                  }
                >
                  Add to paper
                </ActionButton>
              </div>
            </div>
          )}

          {editable && (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label className="block w-full sm:w-auto sm:min-w-0 sm:flex-1">
                  <span className="label">Add from the {subject?.subjectCode} bank</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search text, objective or topic" className="field mt-1.5" />
                </label>
                <ActionButton
                  type="button"
                  variant="secondary"
                  pending={pending}
                  icon={<Sparkles aria-hidden="true" className="size-4" strokeWidth={2} />}
                  onClick={() =>
                    run(
                      () => autoPickAction({ subjectCode: subject?.subjectCode ?? "", exclude: questionIds }),
                      (result) => setQuestionIds((ids) => [...ids, ...((result.questionIds as string[]) ?? [])]),
                    )
                  }
                >
                  Auto-pick 10 weakest
                </ActionButton>
              </div>
              {available.length === 0 ? (
                <p className="mt-2 text-caption text-secondary">No more {subject?.subjectCode} questions in the bank.</p>
              ) : (
                <ul className="mt-2 max-h-80 divide-y divide-subtle overflow-y-auto rounded-panel border border-subtle">
                  {available.map((question) => (
                    <li key={question.id} className="flex items-start gap-2 p-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.875rem] text-primary">{question.preview}</span>
                        <span className="block text-caption text-muted">
                          {question.objectiveCode} - {question.marks} {question.marks === 1 ? "mark" : "marks"}
                        </span>
                      </span>
                      <button type="button" onClick={() => setQuestionIds((ids) => [...ids, question.id])} className="btn-secondary pressable shrink-0">
                        <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {editable && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {existing ? (
              <ActionButton
                pending={pending}
                pendingLabel="Saving"
                icon={<Save aria-hidden="true" className="size-4" strokeWidth={2} />}
                onClick={() => run(() => saveAssessmentAction({ id: existing.id, fields, questionIds }), () => router.refresh())}
                type="button"
              >
                Save
              </ActionButton>
            ) : (
              <ActionButton
                pending={pending}
                pendingLabel="Creating"
                icon={<Plus aria-hidden="true" className="size-4" strokeWidth={2} />}
                onClick={() => run(() => createAssessmentAction(fields), (result) => router.push(`/parent/assessments/${result.id as string}`))}
                type="button"
              >
                Create and add questions
              </ActionButton>
            )}
            <FormMessage result={message} />
          </div>

          {existing && (
            <div className="surface flex flex-wrap items-center gap-3 p-4">
              {existing.status === "Draft" ? (
                <>
                  <label className="flex items-center gap-2 text-[0.875rem] text-secondary">
                    <input type="checkbox" checked={examDay} onChange={(event) => setExamDay(event.target.checked)} className="size-4" />
                    Make the date an exam day (replaces the normal timetable)
                  </label>
                  <ActionButton
                    type="button"
                    pending={pending}
                    icon={<CalendarCheck aria-hidden="true" className="size-4" strokeWidth={2} />}
                    onClick={() => run(() => publishAssessmentAction({ id: existing.id, examDay }), () => router.refresh())}
                  >
                    Schedule for the learner
                  </ActionButton>
                  <span className="text-caption text-muted">Save first: scheduling uses what is saved.</span>
                </>
              ) : (
                <ActionButton
                  type="button"
                  variant="secondary"
                  pending={pending}
                  icon={<Undo2 aria-hidden="true" className="size-4" strokeWidth={2} />}
                  onClick={() => run(() => unpublishAssessmentAction(existing.id), () => router.refresh())}
                >
                  Back to draft
                </ActionButton>
              )}
              <ActionButton
                type="button"
                variant="ghost"
                pending={pending}
                icon={<Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />}
                onClick={() => {
                  if (window.confirm("Delete this assessment? Its questions stay in the bank.")) {
                    run(() => deleteAssessmentAction(existing.id), () => router.push("/parent/assessments"));
                  }
                }}
              >
                Delete
              </ActionButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
