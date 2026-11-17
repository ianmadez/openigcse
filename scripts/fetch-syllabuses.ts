#!/usr/bin/env node
/**
 * Fetches the official Cambridge syllabus PDFs into raw-syllabuses/.
 *
 *   pnpm fetch:syllabuses            # every subject in the registry
 *   pnpm fetch:syllabuses --subject=0620
 *   pnpm fetch:syllabuses --dry-run  # show the URL it would use
 *
 * It reads the subject page listed in src/lib/curriculum/registry.ts, picks the
 * PDF whose filename carries the version label, and saves it under the name the
 * ingest script expects. Nothing is guessed: when no link matches, the subject is
 * reported as missed instead of downloading the wrong document.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { registry, type RegistrySubject } from "../src/lib/curriculum/registry";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "raw-syllabuses");
const USER_AGENT = "OpenIGCSE syllabus ingestion (offline study project)";

type Args = { subject?: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--subject=")) args.subject = raw.slice("--subject=".length);
  }
  return args;
}

async function pdfLinks(pageUrl: string): Promise<string[]> {
  const response = await fetch(pageUrl, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Could not read ${pageUrl} (HTTP ${response.status}).`);

  const html = await response.text();
  const found = new Set<string>();
  for (const match of html.matchAll(/href="([^"]+?\.pdf)"/gi)) {
    const href = match[1];
    if (href) found.add(new URL(href, pageUrl).toString());
  }
  return [...found];
}

/** Prefers the file carrying the version label, avoids "update" notices and specimen papers. */
function score(url: string, subject: RegistrySubject) {
  const file = decodeURIComponent(url.split("/").pop() ?? "").toLowerCase();
  let value = 0;

  if (file.includes(subject.version_label)) value += 20;
  if (file.includes("syllabus")) value += 8;
  if (file.includes(subject.code)) value += 3;
  if (/update|notice|specimen|faq|guidance/.test(file)) value -= 15;
  if (/(^|\W)(0[1-9])-/.test(file) && !file.includes("syllabus")) value -= 5;

  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = args.subject ? registry.filter((item) => item.code === args.subject) : registry;

  if (targets.length === 0) {
    throw new Error(`Unknown subject ${args.subject}. Known codes: ${registry.map((item) => item.code).join(", ")}`);
  }

  const results: Array<{ code: string; status: string; detail: string }> = [];

  for (const subject of targets) {
    try {
      const links = await pdfLinks(subject.syllabus_page);
      const ranked = links
        .map((url) => ({ url, score: score(url, subject) }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best || best.score <= 0) {
        results.push({ code: subject.code, status: "missed", detail: `${links.length} PDFs on the page, none matching ${subject.version_label}` });
        continue;
      }

      if (args.dryRun) {
        results.push({ code: subject.code, status: "would fetch", detail: best.url });
        continue;
      }

      const response = await fetch(best.url, { headers: { "user-agent": USER_AGENT } });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${best.url}`);

      const type = response.headers.get("content-type") ?? "";
      const body = Buffer.from(await response.arrayBuffer());
      const looksLikePdf = body.subarray(0, 4).toString("latin1") === "%PDF";
      if (!type.includes("pdf") && !looksLikePdf) throw new Error(`Expected a PDF, received "${type}".`);

      await mkdir(RAW_DIR, { recursive: true });
      const target = path.join(RAW_DIR, subject.pdf_hint);
      await writeFile(target, body);

      results.push({
        code: subject.code,
        status: "saved",
        detail: `${path.relative(ROOT, target)} (${Math.round(body.byteLength / 1024)} kB from ${best.url})`,
      });
    } catch (error) {
      results.push({ code: subject.code, status: "failed", detail: (error as Error).message });
    }
  }

  for (const line of results) console.log(`${line.code.padEnd(5)} ${line.status.padEnd(11)} ${line.detail}`);

  const missed = results.filter((line) => line.status === "failed").length;
  if (missed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\nFetch failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
