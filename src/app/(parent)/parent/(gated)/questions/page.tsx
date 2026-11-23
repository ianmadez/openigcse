import { Filter, Plus } from "lucide-react";
import Link from "next/link";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { EmptyState, PageHeading, Status } from "@/components/ui/primitives";
import { DIFFICULTIES, DIFFICULTY_LABEL, KIND_LABEL, plainPreview, QUESTION_KINDS, TIERS } from "@/lib/assessment/question";
import { listQuestions, type QuestionFilters } from "@/lib/data/question-bank";
import { getSetupState } from "@/lib/data/session";

import { questionContext } from "./context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question bank" };

type Search = Record<keyof QuestionFilters, string | undefined>;

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<Partial<Search>> }) {
  const state = await getSetupState();
  const heading = (
    <PageHeading eyebrow="Question bank" title="Questions for quizzes and tests">
      Every question is tagged to one syllabus objective, so a mark lost on it shows up against that objective.
    </PageHeading>
  );

  if (state.status !== "configured") {
    return (
      <>
        {heading}
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const search = await searchParams;
  const filters: QuestionFilters = Object.fromEntries(
    Object.entries(search).filter(([, value]) => typeof value === "string" && value !== ""),
  );

  const [{ tree }, questions] = await Promise.all([
    questionContext(state.learnerId, state.activeTermId),
    listQuestions(state.householdId, filters),
  ]);

  const subject = tree.find((item) => item.subjectCode === filters.subject);
  const topics = subject?.topics ?? [];
  const objectives = topics.find((topic) => topic.code === filters.topic)?.objectives ?? [];
  const filtered = Object.keys(filters).length > 0;

  return (
    <>
      {heading}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-secondary tabular">
          {questions.length} {questions.length === 1 ? "question" : "questions"}
          {filtered ? " match" : " in the bank"}
        </p>
        <Link href="/parent/questions/new" className="btn-primary pressable">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
          New question
        </Link>
      </div>

      <form method="get" className="surface mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="block">
          <span className="label">Subject</span>
          <select name="subject" defaultValue={filters.subject ?? ""} className="field mt-1.5">
            <option value="">All</option>
            {tree.map((item) => (
              <option key={item.subjectCode} value={item.subjectCode}>
                {item.subjectCode} {item.subjectName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Topic</span>
          <select name="topic" defaultValue={filters.topic ?? ""} disabled={!subject} className="field mt-1.5">
            <option value="">{subject ? "All" : "Pick a subject"}</option>
            {topics.map((topic) => (
              <option key={topic.code} value={topic.code}>
                {topic.code} {topic.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Objective</span>
          <select name="objective" defaultValue={filters.objective ?? ""} disabled={objectives.length === 0} className="field mt-1.5">
            <option value="">{objectives.length ? "All" : "Pick a topic"}</option>
            {objectives.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.code}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Kind</span>
          <select name="kind" defaultValue={filters.kind ?? ""} className="field mt-1.5">
            <option value="">All</option>
            {QUESTION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Tier</span>
          <select name="tier" defaultValue={filters.tier ?? ""} className="field mt-1.5">
            <option value="">All</option>
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier === "Both" ? "Core and Extended" : tier}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Difficulty</span>
          <select name="difficulty" defaultValue={filters.difficulty ?? ""} className="field mt-1.5">
            <option value="">All</option>
            {DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {DIFFICULTY_LABEL[difficulty]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3 lg:col-span-6">
          <button type="submit" className="btn-secondary pressable">
            <Filter aria-hidden="true" className="size-4" strokeWidth={2} />
            Filter
          </button>
          {filtered && (
            <Link href="/parent/questions" className="btn-ghost pressable">
              Clear
            </Link>
          )}
        </div>
      </form>

      {questions.length === 0 ? (
        <EmptyState title={filtered ? "No questions match" : "The bank is empty"}>
          {filtered
            ? "Loosen a filter, or write a question for this objective."
            : "Write the first question. Multiple choice, short answer, structured and calculation questions are all supported."}
        </EmptyState>
      ) : (
        <ul className="surface divide-y divide-subtle">
          {questions.map((question) => (
            <li key={question.id}>
              <Link
                href={`/parent/questions/${question.id}`}
                className="flex flex-wrap items-start justify-between gap-2 p-4 hover:bg-sunken focus-visible:bg-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.875rem] text-primary">{plainPreview(question.prompt)}</span>
                  <span className="mt-1 block text-caption text-muted">
                    {question.objective
                      ? `${question.objective.subjectCode} ${question.objective.code} - ${question.objective.topicName}`
                      : "Objective not found"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Status tone="neutral">{KIND_LABEL[question.kind] ?? question.kind}</Status>
                  <span className="chip tabular">
                    {question.marks} {question.marks === 1 ? "mark" : "marks"}
                  </span>
                  {question.usedIn > 0 && <Status tone="info">On {question.usedIn}</Status>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
