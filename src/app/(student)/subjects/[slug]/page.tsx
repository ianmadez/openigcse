import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { getSubject as registrySubject } from "@/lib/curriculum/registry";
import { getSubjectCurriculum } from "@/lib/data/curriculum";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export default async function SubjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const state = await getSetupState();

  if (state.status !== "configured" || !state.activeTermId) {
    return (
      <>
        <Link href="/subjects" className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-secondary">
          <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
          All subjects
        </Link>
        {state.status === "signed-out" ? <NeedsSignIn audience="learner" /> : <NeedsSignIn />}
      </>
    );
  }

  const subject = await getSubjectCurriculum(state.learnerId, state.activeTermId, slug);
  if (!subject) notFound();

  const objectivesByTopic = new Map<string, typeof subject.objectives>();
  for (const objective of subject.objectives) {
    const list = objectivesByTopic.get(objective.topicCode) ?? [];
    list.push(objective);
    objectivesByTopic.set(objective.topicCode, list);
  }

  const outline = registrySubject(subject.subjectCode)?.syllabus_page ?? null;
  const draft = subject.versionStatus !== "active";

  return (
    <>
      <Link href="/subjects" className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-secondary">
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
        All subjects
      </Link>

      <PageHeading eyebrow={`${subject.subjectCode} - ${subject.versionLabel}`} title={subject.subjectName}>
        {subject.counts.topics} topics, {subject.counts.subtopics} subtopics and {subject.counts.objectives} objectives
        in this syllabus version.
      </PageHeading>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Status tone={draft ? "warning" : "success"}>
          {draft ? "Draft content, pending extraction" : "Extracted from the official PDF"}
        </Status>
        <span className="chip">{subject.routeName}</span>
        <span className="chip">{subject.tier} tier</span>
        <span className="chip tabular">{subject.weeklyMinutes} min/wk</span>
        {outline && (
          <a
            href={outline}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-caption font-medium text-accent-text"
          >
            Syllabus outline
            <ExternalLink aria-hidden="true" className="size-3" strokeWidth={2} />
          </a>
        )}
      </div>

      {subject.topics.length === 0 ? (
        <EmptyState title="No topics extracted yet">
          This syllabus version is enrolled but has no topics in the database. Run the ingest command for{" "}
          {subject.subjectCode} and import the package.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {subject.topics.map((topic) => (
            <details key={topic.id} className="surface group p-4" open={topic.sequence <= 1}>
              <summary className="flex cursor-pointer list-none items-center gap-2.5">
                <span className="chip tabular">{topic.code}</span>
                <span className="flex-1 text-[0.9375rem] font-medium text-primary">{topic.name}</span>
                <span className="text-caption text-muted">{topic.subtopics.length} subtopics</span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 text-muted transition-transform group-open:rotate-180"
                  strokeWidth={2}
                />
              </summary>

              <div className="mt-3 space-y-3">
                {topic.subtopics.map((subtopic) => {
                  const objectives = objectivesByTopic.get(subtopic.code) ?? [];

                  return (
                    <div key={subtopic.id} className="rounded-panel border border-subtle bg-sunken p-3">
                      <p className="text-caption font-medium text-secondary">
                        {subtopic.code} {subtopic.name}
                      </p>

                      {objectives.length === 0 ? (
                        <p className="mt-1.5 text-caption text-muted">No objectives captured for this subtopic.</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {objectives.map((objective) => (
                            <li key={objective.id} className="flex gap-2 text-[0.8125rem] leading-relaxed">
                              <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
                              <span className="flex-1 text-secondary">{objective.text}</span>
                              <span className="shrink-0 self-start rounded border border-subtle bg-card px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted">
                                {objective.tier}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}

      <div className="mt-5">
        <Panel
          title="Resources"
          description="Lessons and readings attached to this subject's objectives."
          action={<Status tone="neutral">{subject.resources.length} linked</Status>}
        >
          {subject.resources.length === 0 ? (
            <p className="text-caption text-secondary">
              Nothing attached yet. Activities and resources are imported with the package and edited in the marking
              desk.
            </p>
          ) : (
            <ul className="divide-y divide-subtle">
              {subject.resources.slice(0, 8).map((resource) => (
                <li key={resource.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.875rem] text-primary">{resource.title}</span>
                    <span className="block text-caption text-muted">
                      {resource.resourceType} - {resource.objectiveCode}
                    </span>
                  </span>
                  {resource.url && (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn-secondary pressable shrink-0"
                    >
                      Open
                      <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={2} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {subject.resources.length > 8 && (
            <p className="mt-2 text-caption text-muted">
              {subject.resources.length - 8} more resources are attached to this subject.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
