"use client";

import { BadgeCheck, ExternalLink, FileText, Link2, RotateCcw, Save, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  decideLinkAction,
  reopenPackageAction,
  saveObjectiveAction,
  verifyPackageAction,
} from "@/app/(parent)/parent/(gated)/curriculum/actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Callout, Panel, Status } from "@/components/ui/primitives";
import type { EntryRoute, LearningObjective, LineageEntry, Route, TopicNode } from "@/lib/curriculum/schemas";

type Result = { ok: true; message: string } | { ok: false; error: string } | null;

type Props = {
  packageId: string;
  subjectCode: string;
  verified: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  writable: boolean;
  pdfAvailable: boolean;
  topics: TopicNode[];
  objectives: LearningObjective[];
  lineage: LineageEntry[];
  papers: Route[];
  entryRoutes: EntryRoute[];
  unmappedResources: number;
};

export function PackageReview(props: Props) {
  const { packageId, subjectCode, verified, writable, pdfAvailable, topics, objectives, lineage } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const last = useRef<(() => void) | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [topicCode, setTopicCode] = useState(topics[0]?.topic_code ?? "");
  const [page, setPage] = useState<number | null>(objectives.find((o) => o.source_page)?.source_page ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const locked = verified || !writable;

  const run = (action: () => Promise<Exclude<Result, null>>) => {
    last.current = () => run(action);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  };

  const topic = topics.find((t) => t.topic_code === topicCode) ?? topics[0];
  const bySubtopic = useMemo(() => {
    const map = new Map<string, LearningObjective[]>();
    for (const objective of objectives) {
      const list = map.get(objective.topic_code) ?? [];
      list.push(objective);
      map.set(objective.topic_code, list);
    }
    return map;
  }, [objectives]);
  const openLinks = lineage.filter((row) => !row.confirmed).length;
  const pdfUrl = (target: number | null) => `/api/curriculum/pdf/${subjectCode}${target ? `#page=${target}` : ""}`;

  return (
    <div className="space-y-4">
      <FormMessage result={result} onRetry={() => last.current?.()} pending={pending} />

      {!writable && (
        <Callout tone="info" title="Read-only on this server">
          Package files can only be edited on a local checkout running <code>pnpm dev</code>.
        </Callout>
      )}

      <Panel
        title="Verification"
        description={
          verified
            ? `Verified${props.reviewedBy ? ` by ${props.reviewedBy}` : ""}${props.reviewedAt ? ` on ${props.reviewedAt.slice(0, 10)}` : ""}. Reopen it to make changes.`
            : "Mark the package verified once every topic matches the PDF and every progress link is decided."
        }
      >
        {verified ? (
          <div className="flex flex-wrap items-center gap-3">
            <Status tone="success">Verified</Status>
            {writable && (
              <ActionButton
                type="button"
                variant="secondary"
                pending={pending}
                icon={<RotateCcw aria-hidden="true" className="size-4" />}
                onClick={() => run(() => reopenPackageAction(packageId))}
              >
                Reopen for editing
              </ActionButton>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-[0.875rem] text-secondary">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={confirmed}
                disabled={locked}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I checked the objectives, papers and entry routes against the syllabus PDF.
            </label>
            <ActionButton
              type="button"
              pending={pending}
              icon={<BadgeCheck aria-hidden="true" className="size-4" />}
              onClick={() => run(() => verifyPackageAction(packageId, confirmed))}
            >
              Mark verified
            </ActionButton>
            {openLinks > 0 && (
              <p className="text-caption text-warning-text">
                {openLinks} progress link{openLinks === 1 ? "" : "s"} below still need a decision.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Papers and entry routes" description="Read from the assessment overview in the PDF.">
        <ul className="space-y-1 text-[0.875rem] text-secondary">
          {props.papers.map((paper) => (
            <li key={paper.component_code} className="tabular">
              <span className="font-medium text-primary">{paper.name}</span> · {paper.duration_minutes ?? "—"} min ·{" "}
              {paper.marks ?? "—"} marks · {paper.weighting_percent ?? "—"}% · {paper.tier}
              {!paper.private_candidate_eligible && " · not for private candidates"}
              {paper.note && <span className="block text-caption text-muted">{paper.note}</span>}
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1 text-[0.875rem]">
          {props.entryRoutes.map((route) => (
            <li key={route.route_code}>
              <span className="font-medium text-primary">{route.name}</span>{" "}
              <span className="text-secondary">papers {route.component_codes.join(", ")}</span>
            </li>
          ))}
          {props.entryRoutes.length === 0 && <li className="text-danger-text">No entry route could be built.</li>}
        </ul>
      </Panel>

      {lineage.length > 0 && (
        <Panel
          title="Progress links"
          description="These objectives came from the earlier draft package. Choose where any progress on each should move when the package is imported, or choose none."
        >
          <ul className="divide-y divide-subtle">
            {lineage.map((row) => (
              <LinkRow
                key={row.from_code}
                row={row}
                objectives={objectives}
                locked={locked}
                pending={pending}
                onDecide={(to) => run(() => decideLinkAction(packageId, row.from_code, to))}
              />
            ))}
          </ul>
          {props.unmappedResources > 0 && (
            <p className="mt-3 text-caption text-muted">
              {props.unmappedResources} learning resource{props.unmappedResources === 1 ? "" : "s"} from the draft had
              no match and are kept in resources_unmapped.json; they are not imported.
            </p>
          )}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Objectives">
          <label className="block">
            <span className="label">Topic</span>
            <select
              className="field mt-1.5"
              value={topic?.topic_code ?? ""}
              onChange={(e) => setTopicCode(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.topic_code} value={t.topic_code}>
                  {t.topic_code} {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 space-y-5">
            {topic?.subtopics.map((sub) => (
              <section key={sub.topic_code}>
                <h3 className="text-[0.9375rem] font-semibold text-primary">
                  {sub.topic_code.endsWith(".0") ? sub.name : `${sub.topic_code} ${sub.name}`}
                </h3>
                <ol className="mt-2 space-y-3">
                  {(bySubtopic.get(sub.topic_code) ?? []).map((objective) => (
                    <ObjectiveRow
                      key={objective.objective_code}
                      objective={objective}
                      locked={locked}
                      pending={pending}
                      pdfAvailable={pdfAvailable}
                      pdfUrl={pdfUrl(objective.source_page)}
                      onShowPage={() => setPage(objective.source_page)}
                      onSave={(text) => run(() => saveObjectiveAction(packageId, objective.objective_code, text))}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </Panel>

        <div className="hidden lg:block">
          <div className="surface sticky top-20 h-[calc(100dvh-6rem)] overflow-hidden p-0">
            {pdfAvailable ? (
              <iframe key={page ?? 0} title="Syllabus PDF" src={pdfUrl(page)} className="size-full" />
            ) : (
              <p className="flex items-start gap-2 p-4 text-caption text-secondary">
                <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                The syllabus PDF is not in raw-syllabuses/ on this machine. docs/syllabus-pdfs.md explains how to load
                it.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ObjectiveRow({
  objective,
  locked,
  pending,
  pdfAvailable,
  pdfUrl,
  onShowPage,
  onSave,
}: {
  objective: LearningObjective;
  locked: boolean;
  pending: boolean;
  pdfAvailable: boolean;
  pdfUrl: string;
  onShowPage: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(objective.objective_text);
  const changed = text.trim() !== objective.objective_text;
  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-secondary">
        <span className="font-semibold tabular">{objective.objective_code.split("-").pop()}</span>
        <span>{objective.tier}</span>
        {objective.source_page && pdfAvailable && (
          <>
            <button type="button" onClick={onShowPage} className="hidden text-accent-text underline lg:inline">
              Show page {objective.source_page}
            </button>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent-text underline lg:hidden"
            >
              Page {objective.source_page}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </>
        )}
      </div>
      <textarea
        aria-label={`Objective ${objective.objective_code}`}
        className="field min-h-[4.5rem]"
        value={text}
        readOnly={locked}
        onChange={(event) => setText(event.target.value)}
      />
      {changed && !locked && (
        <ActionButton
          type="button"
          variant="secondary"
          pending={pending}
          icon={<Save aria-hidden="true" className="size-4" />}
          onClick={() => onSave(text)}
        >
          Save wording
        </ActionButton>
      )}
    </li>
  );
}

function LinkRow({
  row,
  objectives,
  locked,
  pending,
  onDecide,
}: {
  row: LineageEntry;
  objectives: LearningObjective[];
  locked: boolean;
  pending: boolean;
  onDecide: (to: string | null) => void;
}) {
  const [target, setTarget] = useState(row.to_code ?? "");
  return (
    <li className="space-y-2 py-3">
      <p className="text-[0.875rem] text-primary">
        <span className="font-semibold tabular">{row.from_code}</span> {row.from_text}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1 basis-64">
          <span className="label">Carries over to</span>
          <select className="field mt-1.5" value={target} disabled={locked} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose an objective</option>
            {objectives.map((objective) => (
              <option key={objective.objective_code} value={objective.objective_code}>
                {objective.objective_code.split("-").pop()} {objective.objective_text.slice(0, 90)}
              </option>
            ))}
          </select>
        </label>
        {row.confirmed ? (
          <Status tone="success">{row.to_code ? "Confirmed" : "No successor"}</Status>
        ) : (
          <Status tone="warning">
            {row.to_code ? `Suggested (${Math.round(row.score * 100)}% word match)` : "No match found"}
          </Status>
        )}
      </div>
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            type="button"
            variant="secondary"
            pending={pending}
            icon={<Link2 aria-hidden="true" className="size-4" />}
            onClick={() => target && onDecide(target)}
          >
            Confirm link
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            pending={pending}
            icon={<Unlink aria-hidden="true" className="size-4" />}
            onClick={() => onDecide(null)}
          >
            No successor
          </ActionButton>
        </div>
      )}
    </li>
  );
}
