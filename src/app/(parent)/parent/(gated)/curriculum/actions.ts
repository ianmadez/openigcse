"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { loadPackageForReview, writePackageFile } from "@/lib/curriculum/packageStore";
import { decideLineage, editObjective, verifyManifest } from "@/lib/curriculum/review";
import { getProfileDisplayName } from "@/lib/data/household";
import { carryOverProgress } from "@/lib/data/lineage";

/** Step 6.3: a parent checks an extracted package against the PDF, edits it and marks it verified. */

type Result = { ok: true; message: string } | { ok: false; error: string };

const packageId = z.string().regex(/^\d{4}-[a-z0-9-]+-\d{4}-\d{4}$/);

async function open(id: unknown) {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const parsedId = packageId.safeParse(id);
  if (!parsedId.success) return { ok: false as const, error: "That is not a package id." };
  const pkg = await loadPackageForReview(parsedId.data);
  if (!pkg) return { ok: false as const, error: "That package could not be read." };
  return { ok: true as const, guard: guard.session, pkg };
}

function done(id: string, message: string): Result {
  revalidatePath("/parent/curriculum");
  revalidatePath(`/parent/curriculum/${id}`);
  return { ok: true, message };
}

export async function saveObjectiveAction(id: string, code: string, text: string): Promise<Result> {
  const opened = await open(id);
  if (!opened.ok) return opened;
  if (opened.pkg.manifest.provenance.verified)
    return { ok: false, error: "This package is verified. Reopen it before editing." };

  const edited = editObjective(opened.pkg.objectives, String(code), String(text));
  if (!edited.ok) return edited;
  const written = await writePackageFile(id, "objectives.json", edited.value);
  return written.ok ? done(id, `Saved ${code}.`) : written;
}

export async function decideLinkAction(id: string, fromCode: string, toCode: string | null): Promise<Result> {
  const opened = await open(id);
  if (!opened.ok) return opened;
  if (opened.pkg.manifest.provenance.verified)
    return { ok: false, error: "This package is verified. Reopen it before editing." };

  const decided = decideLineage(
    opened.pkg.lineage,
    opened.pkg.objectives,
    String(fromCode),
    toCode ? String(toCode) : null,
  );
  if (!decided.ok) return decided;
  const written = await writePackageFile(id, "lineage.json", decided.value);
  if (!written.ok) return written;
  return done(id, toCode ? `${fromCode} now carries over to ${toCode}.` : `${fromCode} will not carry over.`);
}

export async function verifyPackageAction(id: string, confirmed: boolean): Promise<Result> {
  if (!confirmed) return { ok: false, error: "Tick the box to confirm you checked the objectives against the PDF." };
  const opened = await open(id);
  if (!opened.ok) return opened;

  const reviewer = (await getProfileDisplayName(opened.guard.profileId)) ?? "Guardian";
  const verified = verifyManifest(opened.pkg.manifest, opened.pkg.lineage, reviewer, new Date());
  if (!verified.ok) return verified;
  const written = await writePackageFile(id, "manifest.json", verified.value);
  return written.ok ? done(id, "Package verified. Import it with pnpm import to publish it.") : written;
}

export async function reopenPackageAction(id: string): Promise<Result> {
  const opened = await open(id);
  if (!opened.ok) return opened;
  const manifest = {
    ...opened.pkg.manifest,
    provenance: { ...opened.pkg.manifest.provenance, verified: false, reviewed_by: null, reviewed_at: null },
  };
  const written = await writePackageFile(id, "manifest.json", manifest);
  return written.ok ? done(id, "Package reopened for editing.") : written;
}

/** Step 6.4: moves this household's progress from retired objectives along confirmed links. */
export async function carryOverProgressAction(): Promise<Result> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const result = await carryOverProgress();
  if (!result.ok) return { ok: false, error: `Progress was not moved: ${result.error}` };
  const moved = Object.entries(result.moved)
    .filter(([key, value]) => key !== "schedules_left_on_retired" && value > 0)
    .map(([key, value]) => `${value} ${key.replace(/_/g, " ")}`);
  const left = result.moved.schedules_left_on_retired ?? 0;
  revalidatePath("/parent/curriculum");
  revalidatePath("/parent/progress");
  return {
    ok: true,
    message:
      (moved.length ? `Moved ${moved.join(", ")}.` : "Nothing was waiting to move.") +
      (left
        ? ` ${left} review schedule${left === 1 ? "" : "s"} stayed on the old objective because the new one already had one.`
        : ""),
  };
}
