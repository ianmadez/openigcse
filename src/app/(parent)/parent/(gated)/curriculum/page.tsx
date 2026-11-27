import Link from "next/link";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { Callout, EmptyState, PageHeading, Panel, Status } from "@/components/ui/primitives";
import { CarryOverPanel } from "@/components/parent/CarryOverPanel";
import { canWritePackages, listPackages } from "@/lib/curriculum/packageStore";
import { getCarryOverStatus } from "@/lib/data/lineage";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Curriculum packages" };

export default async function CurriculumPackagesPage() {
  const state = await getSetupState();
  const heading = (
    <PageHeading eyebrow="Parent area" title="Curriculum packages">
      Each package is extracted from a Cambridge syllabus PDF. Check it against the PDF, fix anything the extraction got
      wrong, then mark it verified so it can be imported.
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

  const [packages, writable, carryOver] = await Promise.all([listPackages(), canWritePackages(), getCarryOverStatus()]);

  return (
    <>
      {heading}
      <div className="space-y-4">
        {!writable && (
          <Callout tone="info" title="Read-only on this server">
            Review packages on a local checkout with <code>pnpm dev</code>; this server cannot write package files.
          </Callout>
        )}
        {carryOver.waiting > 0 && <CarryOverPanel links={carryOver.links} waiting={carryOver.waiting} />}
        {carryOver.error && (
          <Callout tone="warning" title="Progress links could not be read">
            {carryOver.error}
          </Callout>
        )}
        {packages.length === 0 ? (
          <EmptyState title="No packages yet">
            Download the syllabus PDFs and run <code>pnpm ingest</code>. The steps are in docs/syllabus-pdfs.md.
          </EmptyState>
        ) : (
          <Panel
            title="Packages"
            description="Verified packages can be imported; drafts stay labelled as drafts in the app."
          >
            <ul className="divide-y divide-subtle">
              {packages.map((pkg) => (
                <li key={pkg.packageId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  {pkg.valid ? (
                    <>
                      <div className="min-w-0">
                        <Link
                          href={`/parent/curriculum/${pkg.packageId}`}
                          className="touch-target inline-flex items-center font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {pkg.code} {pkg.name}
                        </Link>
                        <p className="text-caption text-secondary tabular">
                          {pkg.versionLabel} · {pkg.objectives} objectives · {pkg.entryRoutes} entry route
                          {pkg.entryRoutes === 1 ? "" : "s"}
                          {pkg.openLinks > 0 &&
                            ` · ${pkg.openLinks} progress link${pkg.openLinks === 1 ? "" : "s"} to confirm`}
                        </p>
                      </div>
                      {pkg.verified ? (
                        <Status tone="success">Verified{pkg.reviewedBy ? ` by ${pkg.reviewedBy}` : ""}</Status>
                      ) : (
                        <Status tone="warning">Needs review</Status>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-primary">{pkg.packageId}</span>
                      <Status tone="danger">Invalid: {pkg.problems[0]}</Status>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
