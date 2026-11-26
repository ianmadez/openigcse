#!/usr/bin/env node
/**
 * Deterministic syllabus ingestion.
 *
 *   pnpm ingest:list
 *   pnpm ingest -- --subject=0580 --pdf raw-syllabuses/0580-mathematics-2028-2030.pdf
 *   pnpm ingest -- --subject=0625 --url https://example.org/0625_y26_sy.pdf
 *
 * The script only writes text that exists in the PDF. When the structure cannot
 * be found it exits non-zero instead of writing a partial package.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSubject, registry } from "../src/lib/curriculum/registry";
import { SCHEMA_VERSION } from "../src/lib/curriculum/schemas";
import { extractItems } from "./lib/pdfItems";
import { commandWordOf, parseSyllabus } from "./lib/syllabusParser";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "raw-syllabuses");
const PACKAGE_ROOT = path.join(ROOT, "curriculum-packages");

const CODE_PREFIX: Record<string, string> = {
  "0580": "MA",
  "0478": "CS",
  "0610": "BI",
  "0620": "CH",
  "0625": "PH",
  "0500": "EN",
  "0460": "GG",
  "0470": "HI",
  "0455": "EC",
  "0530": "SP",
};

type Args = {
  subject?: string;
  pdf?: string;
  url?: string;
  years?: string;
  dryRun: boolean;
  list: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, list: false };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--list") args.list = true;
    else if (raw.startsWith("--subject=")) args.subject = raw.slice("--subject=".length);
    else if (raw.startsWith("--pdf=")) args.pdf = raw.slice("--pdf=".length);
    else if (raw.startsWith("--url=")) args.url = raw.slice("--url=".length);
    else if (raw.startsWith("--years=")) args.years = raw.slice("--years=".length);
  }
  return args;
}

async function download(url: string, target: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "OpenIGCSE syllabus ingestion (offline study project)" },
  });
  if (!response.ok) {
    throw new Error(
      `Download failed with HTTP ${response.status}. Save the PDF into raw-syllabuses/ and pass --pdf instead.`,
    );
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("pdf")) {
    throw new Error(`Expected a PDF, received "${type}". Open the syllabus page and pass the direct PDF URL.`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.table(
      registry.map((subject) => ({
        code: subject.code,
        subject: subject.name,
        version: subject.version_label,
        route: subject.private_candidate.route_status,
        pdf: subject.pdf_hint,
      })),
    );
    return;
  }

  if (!args.subject) throw new Error("Pass --subject=<code>. Run with --list to see the registry.");

  const subject = getSubject(args.subject);
  if (!subject) {
    throw new Error(`Unknown subject ${args.subject}. Known codes: ${registry.map((item) => item.code).join(", ")}`);
  }

  const years = args.years ?? subject.version_label;
  const slug = `${subject.code}-${subject.slug}-${years}`;
  const outDir = path.join(PACKAGE_ROOT, slug);

  let pdfPath = args.pdf ? path.resolve(ROOT, args.pdf) : path.join(RAW_DIR, subject.pdf_hint);

  if (args.url) {
    await download(args.url, pdfPath);
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(pdfPath);
  } catch {
    throw new Error(
      `Could not read ${path.relative(ROOT, pdfPath)}.\n` +
        "Download the official syllabus PDF from the Cambridge page and save it there:\n" +
        `  ${subject.syllabus_page}\n` +
        `Expected filename: ${subject.pdf_hint}`,
    );
  }

  const items = await extractItems(buffer);
  const parsed = parseSyllabus(items, subject.content_layout);
  const prefix = CODE_PREFIX[subject.code] ?? subject.code;

  const topics = parsed.topics.map((topic, index) => ({
    topic_code: topic.topic_code,
    name: topic.name,
    sequence: index + 1,
    subtopics: topic.subtopics.map((subtopic, subIndex) => ({
      topic_code: subtopic.topic_code,
      name: subtopic.name,
      sequence: subIndex + 1,
    })),
  }));

  const objectives = parsed.topics.flatMap((topic) =>
    topic.subtopics.flatMap((subtopic) =>
      subtopic.objectives.map((objective, index) => ({
        objective_code: `${prefix}-${subject.code}-${objective.local_code}`,
        topic_code: subtopic.topic_code,
        objective_text: objective.text,
        command_word: commandWordOf(objective.text),
        tier: objective.tier,
        sequence: index + 1,
        supplement_text: null,
      })),
    ),
  );

  const routes = subject.private_candidate.components.map((component) => ({
    component_code: component.component_code,
    name: component.name,
    duration_minutes: component.duration_minutes,
    weighting_percent: component.weighting_percent,
    tier: component.tier,
    assessment_style: "written",
    private_candidate_eligible: component.private_candidate_eligible,
    note: component.note ?? "",
  }));

  const manifest = {
    schema_version: SCHEMA_VERSION,
    package_id: slug,
    subject: {
      code: subject.code,
      slug: subject.slug,
      name: subject.name,
      qualification: subject.qualification,
      awarding_body: "Cambridge Assessment International Education",
      version_label: years,
      exam_series: subject.exam_series,
      tiers: subject.tiers,
      grade_scale: "A*-G",
      mastery_mode: subject.code === "0500" ? "skill-rubric" : "objective-mastery",
      is_elective: subject.is_elective,
    },
    provenance: {
      method: "pdf-extraction",
      source_file: path.relative(ROOT, pdfPath).replace(/\\/g, "/"),
      extracted_at: new Date().toISOString(),
      // A person checks every extraction on the package review screen before it is verified.
      verified: false,
      notes:
        `Parsed ${items.length} text items with the ${parsed.layout} layout (${parsed.mode}). ` +
        "Components come from the subject registry; objectives come from the PDF.",
    },
    files: {
      topics: "topics.json",
      objectives: "objectives.json",
      routes: "routes.json",
      assessment_objectives: "assessment_objectives.json",
    },
    counts: {
      topics: topics.length,
      subtopics: topics.reduce((sum, topic) => sum + topic.subtopics.length, 0),
      objectives: objectives.length,
      components: routes.length,
      assessment_objectives: 0,
    },
    generated_at: new Date().toISOString(),
  };

  for (const warning of parsed.warnings) console.warn(`warning: ${warning}`);

  if (args.dryRun) {
    console.log(`Dry run: ${topics.length} topics, ${objectives.length} objectives, ${routes.length} components.`);
    return;
  }

  await mkdir(outDir, { recursive: true });
  const write = (file: string, value: unknown) =>
    writeFile(path.join(outDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");

  await write("manifest.json", manifest);
  await write("topics.json", topics);
  await write("objectives.json", objectives);
  await write("routes.json", routes);
  await write("assessment_objectives.json", []);

  console.log(
    `Wrote ${path.relative(ROOT, outDir)}: ${topics.length} topics, ` +
      `${manifest.counts.subtopics} subtopics, ${objectives.length} objectives.`,
  );
  console.log("Assessment objectives were not found in this pass; extract them before publishing.");
}

main().catch((error: unknown) => {
  console.error(`\nIngestion failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
