import "server-only";

import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

import { getSubject } from "./registry";
import { PackageImportError, readPackage } from "./packageImporter";
import type { CurriculumPackage, LearningResource } from "./schemas";

/**
 * Step 6.3: the package review screen reads and writes the JSON files in
 * curriculum-packages/ directly. That is a maintainer task on a local checkout;
 * a hosted build has a read-only file system and shows the screen read-only.
 */

const ROOT = path.join(process.cwd(), "curriculum-packages");
const PDF_ROOT = path.join(process.cwd(), "raw-syllabuses");
const PACKAGE_ID = /^\d{4}-[a-z0-9-]+-\d{4}-\d{4}$/;

export type PackageSummary =
  | {
      packageId: string;
      valid: true;
      code: string;
      name: string;
      versionLabel: string;
      verified: boolean;
      reviewedBy: string | null;
      objectives: number;
      entryRoutes: number;
      openLinks: number;
    }
  | { packageId: string; valid: false; problems: string[] };

function dirFor(packageId: string): string {
  if (!PACKAGE_ID.test(packageId)) throw new Error("That is not a package id.");
  return path.join(ROOT, packageId);
}

export async function canWritePackages(): Promise<boolean> {
  if (process.env.VERCEL) return false;
  try {
    await access(ROOT, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function listPackages(): Promise<PackageSummary[]> {
  let entries: string[];
  try {
    entries = (await readdir(ROOT, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const summaries: PackageSummary[] = [];
  for (const packageId of entries.sort()) {
    try {
      const pkg = await readPackage(path.join(ROOT, packageId));
      summaries.push({
        packageId,
        valid: true,
        code: pkg.manifest.subject.code,
        name: pkg.manifest.subject.name,
        versionLabel: pkg.manifest.subject.version_label,
        verified: pkg.manifest.provenance.verified,
        reviewedBy: pkg.manifest.provenance.reviewed_by,
        objectives: pkg.objectives.length,
        entryRoutes: pkg.entryRoutes.length,
        openLinks: pkg.lineage.filter((row) => !row.confirmed).length,
      });
    } catch (error) {
      summaries.push({
        packageId,
        valid: false,
        problems: error instanceof PackageImportError ? error.problems : [(error as Error).message],
      });
    }
  }
  return summaries;
}

export type ReviewPackage = CurriculumPackage & {
  packageId: string;
  unmappedResources: LearningResource[];
  pdfAvailable: boolean;
};

export async function loadPackageForReview(packageId: string): Promise<ReviewPackage | null> {
  const dir = dirFor(packageId);
  let pkg: CurriculumPackage;
  try {
    pkg = await readPackage(dir);
  } catch {
    return null;
  }
  let unmappedResources: LearningResource[] = [];
  try {
    unmappedResources = JSON.parse(
      await readFile(path.join(dir, "resources_unmapped.json"), "utf8"),
    ) as LearningResource[];
  } catch {
    unmappedResources = [];
  }
  return {
    ...pkg,
    packageId,
    unmappedResources,
    pdfAvailable: (await syllabusPdfPath(pkg.manifest.subject.code)) !== null,
  };
}

/** Writes one package file after re-validating the whole package with the change applied. */
export async function writePackageFile(
  packageId: string,
  file: "objectives.json" | "lineage.json" | "manifest.json",
  value: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canWritePackages()))
    return { ok: false, error: "Packages are read-only on this server. Review on a local checkout." };
  const dir = dirFor(packageId);
  const target = path.join(dir, file);
  const before = await readFile(target, "utf8");
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await readPackage(dir);
    return { ok: true };
  } catch (error) {
    // Never leave an invalid package on disk.
    await writeFile(target, before, "utf8");
    const problems = error instanceof PackageImportError ? error.problems.join("; ") : (error as Error).message;
    return { ok: false, error: `The change was not saved: ${problems}` };
  }
}

/** The local syllabus PDF for a subject, or null when it has not been downloaded. */
export async function syllabusPdfPath(code: string): Promise<string | null> {
  const subject = getSubject(code);
  if (!subject) return null;
  const file = path.join(PDF_ROOT, subject.pdf_hint);
  try {
    await access(file, constants.R_OK);
    return file;
  } catch {
    return null;
  }
}
