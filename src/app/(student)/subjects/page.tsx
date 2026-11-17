import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { getEnrolledCurriculum, type SubjectCurriculum } from "@/lib/data/curriculum";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Subjects" };

function SubjectRow({ subject }: { subject: SubjectCurriculum }) {
  const draft = subject.versionStatus !== "active";

  return (
    <li>
      <Link href={`/subjects/${subject.slug}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[0.9375rem] font-medium text-primary">
              {subject.subjectCode} {subject.subjectName}
            </span>
            <Status tone={draft ? "warning" : "success"}>{draft ? "Draft" : "Extracted"}</Status>
          </span>
          <span className="mt-0.5 block text-caption text-muted">
            {subject.versionLabel} - {subject.counts.topics} topics - {subject.counts.objectives} objectives -{" "}
            {subject.tier} tier
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted" strokeWidth={2} />
      </Link>
    </li>
  );
}

export default async function SubjectsPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Syllabus" title="Subjects">
          Every topic and objective is read from the syllabus tables in Postgres, scoped to the entries this learner is
          enrolled for.
        </PageHeading>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const subjects = state.activeTermId
    ? await getEnrolledCurriculum(state.learnerId, state.activeTermId)
    : [];

  const core = subjects.filter((subject) => !subject.isElective);
  const electives = subjects.filter((subject) => subject.isElective);

  return (
    <>
      <PageHeading eyebrow={`${state.term?.name ?? "No term"} - ${state.learnerName}`} title="Subjects">
        Read from the syllabus tables and limited to the entry routes on this term. A draft package is fine for
        practice, but the extraction pipeline replaces it before an exam entry.
      </PageHeading>

      {subjects.length === 0 ? (
        <EmptyState title="No subjects on this term yet">
          Enrolments are created by onboarding or the term planner. Ask a parent to add the papers being entered, then
          this page fills in.
        </EmptyState>
      ) : (
        <>
          <Panel title="Core subjects" className="mb-4">
            <ul className="divide-y divide-subtle">
              {core.map((subject) => (
                <SubjectRow key={subject.enrollmentId} subject={subject} />
              ))}
              {core.length === 0 && (
                <li className="py-2 text-caption text-muted">Every enrolment on this term is an elective.</li>
              )}
            </ul>
          </Panel>

          <Panel title="Term elective" description="The papers outside the core set.">
            <ul className="divide-y divide-subtle">
              {electives.map((subject) => (
                <SubjectRow key={subject.enrollmentId} subject={subject} />
              ))}
              {electives.length === 0 && (
                <li className="py-2 text-caption text-muted">No elective is chosen for this term.</li>
              )}
            </ul>

            <p className="mt-3 flex items-start gap-2 text-caption text-muted">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              A subject appears here only once an entry route exists for it, because that route is what the
              private-candidate check needs before a paper can be entered.
            </p>
          </Panel>
        </>
      )}
    </>
  );
}
