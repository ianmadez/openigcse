import Link from "next/link";
import { notFound } from "next/navigation";

import { NeedsSignIn } from "@/components/auth/NeedsSignIn";
import { PackageReview } from "@/components/parent/PackageReview";
import { PageHeading } from "@/components/ui/primitives";
import { canWritePackages, loadPackageForReview } from "@/lib/curriculum/packageStore";
import { getSetupState } from "@/lib/data/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Review package" };

export default async function ReviewPackagePage({ params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await params;
  const state = await getSetupState();
  if (state.status !== "configured") {
    return (
      <>
        <PageHeading eyebrow="Curriculum" title="Review package" />
        <NeedsSignIn reason={state.status === "signed-out" ? "signed-out" : "no-household"} />
      </>
    );
  }

  if (!/^\d{4}-[a-z0-9-]+-\d{4}-\d{4}$/.test(packageId)) notFound();
  const [pkg, writable] = await Promise.all([loadPackageForReview(packageId), canWritePackages()]);
  if (!pkg) notFound();

  return (
    <>
      <PageHeading eyebrow="Curriculum" title={`${pkg.manifest.subject.code} ${pkg.manifest.subject.name}`}>
        Syllabus {pkg.manifest.subject.version_label}. Compare each objective with the PDF page beside it.{" "}
        <Link href="/parent/curriculum" className="text-accent-text underline">
          All packages
        </Link>
      </PageHeading>
      <PackageReview
        packageId={pkg.packageId}
        subjectCode={pkg.manifest.subject.code}
        verified={pkg.manifest.provenance.verified}
        reviewedBy={pkg.manifest.provenance.reviewed_by}
        reviewedAt={pkg.manifest.provenance.reviewed_at}
        writable={writable}
        pdfAvailable={pkg.pdfAvailable}
        topics={pkg.topics}
        objectives={pkg.objectives}
        lineage={pkg.lineage}
        papers={pkg.routes}
        entryRoutes={pkg.entryRoutes}
        unmappedResources={pkg.unmappedResources.length}
      />
    </>
  );
}
