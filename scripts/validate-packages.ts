#!/usr/bin/env node
/**
 * Validates every package folder against the zod contracts and the cross-file
 * integrity rules the importer enforces. Exits non-zero on any problem, so it is
 * safe to run in CI.
 *
 * Usage: pnpm validate          structural checks
 *        pnpm validate --gate   also requires verified=true and an entry route (Phase 6 exit gate)
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import { PackageImportError, readPackage } from "../src/lib/curriculum/packageImporter";

const ROOT = path.join(process.cwd(), "curriculum-packages");

const GATE = process.argv.includes("--gate");

async function main() {
  const rows: Array<Record<string, string | number>> = [];
  let failures = 0;

  for (const entry of await readdir(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    try {
      const pkg = await readPackage(path.join(ROOT, entry.name));
      rows.push({
        package: entry.name,
        method: pkg.manifest.provenance.method,
        verified: pkg.manifest.provenance.verified ? "yes" : "no",
        topics: pkg.manifest.counts.topics,
        objectives: pkg.manifest.counts.objectives,
        components: pkg.routes.length,
        entry_routes: pkg.entryRoutes.length,
      });
      if (GATE) {
        const gaps = [
          ...(pkg.manifest.provenance.verified ? [] : ["not verified on the package review screen"]),
          ...(pkg.entryRoutes.length > 0 ? [] : ["no entry route"]),
        ];
        if (gaps.length > 0) {
          failures += 1;
          console.error(`
${entry.name}`);
          for (const gap of gaps) console.error(`  - ${gap}`);
        }
      }
    } catch (error) {
      failures += 1;
      rows.push({
        package: entry.name,
        method: "INVALID",
        verified: "-",
        topics: 0,
        objectives: 0,
        components: 0,
        entry_routes: 0,
      });
      console.error(`\n${entry.name}`);
      const problems =
        error instanceof PackageImportError
          ? error.problems.length
            ? error.problems
            : [error.message]
          : [(error as Error).message];
      for (const problem of problems) console.error(`  - ${problem}`);
    }
  }

  console.table(rows);

  if (failures > 0) {
    console.error(`\n${failures} package(s) failed validation.`);
    process.exit(1);
  }

  console.log(`\nAll ${rows.length} packages are structurally valid.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
