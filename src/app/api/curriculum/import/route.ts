import { NextResponse } from "next/server";

import { readdir } from "node:fs/promises";
import path from "node:path";

import { PackageImportError, importPackage, readPackage, resolvePackageDir } from "@/lib/curriculum/packageImporter";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorise(request: Request) {
  const expected = process.env.CURRICULUM_IMPORT_TOKEN;
  if (!expected) return { ok: false, reason: "CURRICULUM_IMPORT_TOKEN is not set on the server." };

  const provided = request.headers.get("x-admin-token");
  if (provided !== expected) return { ok: false, reason: "Invalid admin token." };

  return { ok: true as const };
}

/** Lists every package folder with its validation status. */
export async function GET() {
  const root = path.resolve(process.cwd(), "curriculum-packages");
  const entries = await readdir(root, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const pkg = await readPackage(path.join(root, entry.name));
      packages.push({
        packageId: entry.name,
        subject: `${pkg.manifest.subject.code} ${pkg.manifest.subject.name}`,
        versionLabel: pkg.manifest.subject.version_label,
        method: pkg.manifest.provenance.method,
        verified: pkg.manifest.provenance.verified,
        counts: pkg.manifest.counts,
        valid: true,
      });
    } catch (error) {
      packages.push({
        packageId: entry.name,
        valid: false,
        problems: error instanceof PackageImportError ? error.problems : [(error as Error).message],
      });
    }
  }

  return NextResponse.json({ packages });
}

/**
 * Imports one package. Requires the x-admin-token header; the route is the
 * only place a service-role key is used.
 */
export async function POST(request: Request) {
  const auth = authorise(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const {
    packageId,
    allowDraft = false,
    dryRun = false,
  } = (body ?? {}) as {
    packageId?: string;
    allowDraft?: boolean;
    dryRun?: boolean;
  };

  if (!packageId) {
    return NextResponse.json({ error: "packageId is required." }, { status: 400 });
  }

  try {
    const pkg = await readPackage(resolvePackageDir(packageId));
    const client = dryRun ? null : createAdminClient();
    const result = await importPackage(client as never, pkg, { allowDraft, dryRun });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PackageImportError) {
      return NextResponse.json({ error: error.message, problems: error.problems }, { status: 422 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
