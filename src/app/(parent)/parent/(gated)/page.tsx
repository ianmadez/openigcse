import Link from "next/link";
import { ArrowRight, ClipboardCheck, LifeBuoy, ShieldCheck, TriangleAlert } from "lucide-react";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { EvidenceQueue } from "@/components/parent/EvidenceQueue";
import { CorrectionQueue } from "@/components/parent/CorrectionQueue";
import { EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { getTermAssessments } from "@/lib/data/assessments";
import { getAvailableSubjects, getEnrolledCurriculum } from "@/lib/data/curriculum";
import { getDevices, onlineCount } from "@/lib/data/devices";
import { listEvidenceQueue } from "@/lib/data/evidence";
import { getFocusPolicy } from "@/lib/data/focus";
import { countOpen, getMistakes } from "@/lib/data/mistakes";
import { getRequests } from "@/lib/data/requests";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Parent overview" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export default async function ParentOverviewPage() {
  const state = await getSetupState();

  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Parent area" title="Parent overview">
          Marking, term dates and focus controls, read from the household's own rows.
        </PageHeading>
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  const [subjects, mistakes, assessments, devices, requests, focus, available, evidence] = await Promise.all([
    state.activeTermId ? getEnrolledCurriculum(state.learnerId, state.activeTermId) : Promise.resolve([]),
    getMistakes(state.learnerId),
    state.activeTermId ? getTermAssessments(state.activeTermId) : Promise.resolve([]),
    getDevices(state.householdId),
    getRequests(state.householdId, 5),
    getFocusPolicy(state.householdId),
    getAvailableSubjects(),
    listEvidenceQueue(state.householdId),
  ]);

  const openMistakes = countOpen(mistakes);
  const corrections = mistakes.filter((mistake) => mistake.status === "open" && mistake.correctionSubmitted);
  const pending = requests.filter((request) => request.status === "pending").length;
  const nextAssessment = assessments.find((assessment) => assessment.scheduledFor) ?? null;
  const unpaired = available.filter((subject) => !subject.hasPrivateRoute);

  return (
    <>
      <PageHeading eyebrow={`${state.householdName} - ${state.term?.name ?? "no active term"}`} title="Parent overview">
        Everything here is a live read. An empty panel means nothing has happened yet, not that the data is missing.
      </PageHeading>

      <div className="mb-4">
        <Panel
          title="Work to review"
          description="Photos, PDFs and write-ups the learner sent. Approve them or send them back with notes."
          action={<Status tone={evidence.length > 0 ? "warning" : "success"}>{evidence.length} waiting</Status>}
        >
          <EvidenceQueue items={evidence} />
        </Panel>
      </div>

      <div className="mb-4">
        <Panel
          title="Corrections to accept"
          description="Mistakes with no question to retry close when you accept the learner's written correction."
          action={<Status tone={corrections.length > 0 ? "warning" : "success"}>{corrections.length} waiting</Status>}
        >
          <CorrectionQueue items={corrections} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Waiting on you"
          action={<Status tone={pending > 0 ? "warning" : "success"}>{pending} request(s)</Status>}
        >
          <ul className="space-y-2">
            <li className="flex items-start gap-2.5 rounded-panel border border-subtle bg-sunken p-3">
              <LifeBuoy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-medium text-primary">
                  {pending === 0 ? "No open requests" : `${pending} request${pending === 1 ? "" : "s"} from the learner`}
                </p>
                <p className="text-caption text-muted">
                  Stuck flags and break asks land here once the learner device can raise them.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-2.5 rounded-panel border border-subtle bg-sunken p-3">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-medium text-primary">
                  {openMistakes === 0 ? "No open mistakes" : `${openMistakes} mistake(s) still unresolved`}
                </p>
                <p className="text-caption text-muted">
                  {openMistakes === 0
                    ? "Nothing has been marked down yet."
                    : "They resurface in the learner's review queue."}
                </p>
              </div>
            </li>

            <li className="flex items-start gap-2.5 rounded-panel border border-subtle bg-sunken p-3">
              <ClipboardCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-text" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-medium text-primary">
                  {devices.length === 0
                    ? "No device paired"
                    : `${onlineCount(devices)} of ${devices.length} device(s) seen recently`}
                </p>
                <p className="text-caption text-muted">
                  {devices.length === 0 ? "Pair the study device from settings." : "Paired devices report a heartbeat."}
                </p>
              </div>
              <Link href="/parent/settings" className="btn-secondary pressable shrink-0">
                Open
                <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </Link>
            </li>
          </ul>
        </Panel>

        <Panel title="Next assessment" description="Pulled from the term planner.">
          {nextAssessment ? (
            <div>
              <p className="text-heading font-semibold text-primary">{nextAssessment.title}</p>
              <p className="mt-1 text-caption text-muted">
                {dateFormat.format(new Date(nextAssessment.scheduledFor))} - {nextAssessment.daysUntil === 0 ? "today" : nextAssessment.daysUntil === 1 ? "tomorrow" : `${nextAssessment.daysUntil} days away`}
                {nextAssessment.durationMinutes ? ` - ${nextAssessment.durationMinutes} min` : ""}
              </p>
              <Link href="/parent/term-planner" className="btn-secondary pressable mt-3">
                Adjust the term
                <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </Link>
            </div>
          ) : (
            <EmptyState title="Nothing scheduled">
              The term planner writes assessments here once a parent adds one.
            </EmptyState>
          )}

          <div className="mt-5 border-t border-subtle pt-4">
            <p className="label mb-2">Focus</p>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[0.875rem] text-secondary">
                <ShieldCheck
                  aria-hidden="true"
                  className={focus?.isLocked ? "size-4 text-success" : "size-4 text-muted"}
                  strokeWidth={2}
                />
                {focus ? (focus.isLocked ? "Locked to the study routes" : "Open") : "No policy yet"}
              </span>
              <Link href="/parent/focus" className="text-caption font-medium text-accent-text">
                Change
              </Link>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Syllabus packages" description="What this term is entered for, and what still has no route.">
          {subjects.length === 0 ? (
            <EmptyState title="No enrolments yet">
              Finish onboarding or add subjects in the term planner, and the enrolled papers appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-subtle">
              {subjects.map((subject) => (
                <li key={subject.enrollmentId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] text-primary">
                      {subject.subjectCode} {subject.subjectName}
                    </span>
                    <span className="block text-caption text-muted">
                      {subject.versionLabel} - {subject.counts.objectives} objectives - {subject.tier} tier
                    </span>
                  </span>
                  <Status
                    tone={
                      subject.versionStatus === "active"
                        ? "success"
                        : subject.counts.objectives === 0
                          ? "danger"
                          : "warning"
                    }
                  >
                    {subject.versionStatus === "active"
                      ? "Extracted"
                      : subject.counts.objectives === 0
                        ? "No content"
                        : "Draft"}
                  </Status>
                </li>
              ))}
            </ul>
          )}

          {unpaired.length > 0 && (
            <p className="mt-3 text-caption text-muted">
              {unpaired.length} subject{unpaired.length === 1 ? "" : "s"} in the catalogue still have no private
              candidate route ({unpaired.map((subject) => subject.code).join(", ")}), so they cannot be enrolled yet.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
