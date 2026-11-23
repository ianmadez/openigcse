import Link from "next/link";
import { FileText } from "lucide-react";

import { EvidenceUpload } from "@/components/student/EvidenceUpload";
import { Callout, EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { EVIDENCE_LABEL } from "@/lib/assessment/evidence";
import { getAuthContext } from "@/lib/auth/session";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { listLearnerEvidence } from "@/lib/data/evidence";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence" };

const TONE = { Submitted: "info", NeedsCorrection: "warning", Approved: "success" } as const;
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export default async function EvidencePage({ searchParams }: { searchParams: Promise<{ fix?: string }> }) {
  const [state, context] = await Promise.all([getSetupState(), getAuthContext()]);
  const heading = (
    <PageHeading eyebrow="Evidence" title="Show your work">
      Photos of written work, practical write-ups or PDFs. Your parent reviews each one and can ask for changes.
    </PageHeading>
  );
  if (state.status !== "configured") return heading;

  const learnerId = context?.role === "student" && context.profileId ? context.profileId : state.learnerId;
  const isLearner = context?.role === "student";
  const [items, curriculum] = await Promise.all([
    listLearnerEvidence(learnerId),
    state.activeTermId ? getEnrolledCurriculum(learnerId, state.activeTermId) : Promise.resolve([]),
  ]);

  const objectives = curriculum.flatMap((subject) =>
    subject.objectives.map((objective) => ({
      id: objective.id,
      label: `${subject.subjectCode} ${objective.code} ${objective.text.slice(0, 60)}`,
    })),
  );

  const { fix } = await searchParams;
  const toFix = items.find((item) => item.id === fix && item.status === "NeedsCorrection") ?? null;

  return (
    <>
      {heading}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={toFix ? `Correct: ${toFix.title}` : "Send new work"}>
          {isLearner ? (
            <EvidenceUpload key={toFix?.id ?? "new"} objectives={objectives} previous={toFix ? { id: toFix.id, title: toFix.title } : null} />
          ) : (
            <Callout tone="neutral" title="Learner's device only">
              Evidence is sent from the learner&apos;s own signed-in device. Reviews happen on the parent overview.
            </Callout>
          )}
        </Panel>

        <section aria-labelledby="sent-work">
          <h2 id="sent-work" className="mb-2 text-heading font-semibold text-primary">
            Sent work
          </h2>
          {items.length === 0 ? (
            <EmptyState title="Nothing sent yet">Work you send shows here with your parent&apos;s feedback.</EmptyState>
          ) : (
            <ul className="surface divide-y divide-subtle">
              {items.map((item) => (
                <li key={item.id} className="space-y-1.5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-[0.875rem] font-medium text-primary">{item.title}</span>
                    <Status tone={TONE[item.status]}>{EVIDENCE_LABEL[item.status]}</Status>
                  </div>
                  <p className="text-caption text-muted tabular">
                    {dateFormat.format(new Date(item.createdAt))}
                    {item.objectiveCode ? ` - ${item.subjectCode} ${item.objectiveCode}` : ""}
                    {item.previousId ? " - corrected version" : ""}
                  </p>
                  {item.fileUrl && (
                    <a href={item.fileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-caption text-accent-text underline">
                      <FileText aria-hidden="true" className="size-3.5" strokeWidth={2} />
                      Open the file
                    </a>
                  )}
                  {item.feedback && <p className="text-caption text-secondary">Feedback: {item.feedback}</p>}
                  {item.status === "NeedsCorrection" && isLearner && (
                    <Link href={`/evidence?fix=${item.id}`} className="btn-secondary pressable inline-flex">
                      Send a corrected version
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
