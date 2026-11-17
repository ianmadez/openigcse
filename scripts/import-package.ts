#!/usr/bin/env node
/**
 * Imports one package straight from disk, using the service role from
 * .env.local. Useful before the admin API or a UI exists.
 *
 *   pnpm import --subject=0610 --allow-draft
 *   pnpm import --package=0580-mathematics-2028-2030 --dry-run
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  PackageImportError,
  importPackage,
  readPackage,
  resolvePackageDir,
} from "../src/lib/curriculum/packageImporter";

type Args = { packageId?: string; subject?: string; allowDraft: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { allowDraft: false, dryRun: false };
  for (const raw of argv) {
    if (raw === "--allow-draft") args.allowDraft = true;
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--package=")) args.packageId = raw.slice("--package=".length);
    else if (raw.startsWith("--subject=")) args.subject = raw.slice("--subject=".length);
  }
  return args;
}

/** Minimal .env.local reader: KEY=value, ignoring comments and quotes. */
async function loadEnv() {
  try {
    const raw = await readFile(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = (value ?? "").replace(/^["']|["']$/g, "");
    }
  } catch {
    console.warn("No .env.local found; falling back to the process environment.");
  }
}

async function resolvePackageId(args: Args) {
  if (args.packageId) return args.packageId;
  if (!args.subject) throw new Error("Pass --package=<folder> or --subject=<code>.");
  const match = (await readFile(path.resolve(process.cwd(), "package.json"), "utf8")).includes("openigcse");
  const dirs = await (await import("node:fs/promises")).readdir(path.resolve(process.cwd(), "curriculum-packages"));
  const folder = dirs.find((name) => name.startsWith(`${args.subject}-`));
  if (!folder || !match) throw new Error(`No package folder starts with ${args.subject}-`);
  return folder;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnv();

  const packageId = await resolvePackageId(args);
  const pkg = await readPackage(resolvePackageDir(packageId));

  if (args.dryRun) {
    const result = await importPackage(null as never, pkg, { allowDraft: args.allowDraft, dryRun: true });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await importPackage(client, pkg, { allowDraft: args.allowDraft });

  console.log(`${result.packageId} -> ${result.subjectCode} ${result.versionLabel}`);
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  for (const step of result.steps) console.log(`  ${step.step.padEnd(20)} ${step.detail}`);
  console.log("Imported. Rerun to confirm it is idempotent.");
}

main().catch((error: unknown) => {
  if (error instanceof PackageImportError) {
    console.error(`\nImport failed: ${error.message}`);
    for (const problem of error.problems) console.error(`  - ${problem}`);
  } else {
    console.error(`\nImport failed: ${(error as Error).message}`);
  }
  process.exitCode = 1;
});
