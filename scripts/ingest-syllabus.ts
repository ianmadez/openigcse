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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getSubject, registry } from "../src/lib/curriculum/registry";
import { proposeLineage, remapResources } from "../src/lib/curriculum/lineage";
import { SCHEMA_VERSION } from "../src/lib/curriculum/schemas";
import {
  buildEntryRoutes,
  parseAssessmentObjectives,
  parseCommandWords,
  parseComponents,
} from "./lib/assessmentParser";
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
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, list: false, force: false };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--list") args.list = true;
    else if (raw === "--force") args.force = true;
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
        source_page: objective.page > 0 ? objective.page : null,
      })),
    ),
  );

  const assessment = parseComponents(items);
  const tiers: Array<"Core" | "Extended" | "Untiered"> = assessment.components.some((c) => c.tier === "Core")
    ? ["Core", "Extended"]
    : ["Untiered"];
  const routes = assessment.components.map((component) => ({
    component_code: component.component_code,
    name: component.name,
    duration_minutes: component.duration_minutes,
    weighting_percent: component.weighting_percent,
    tier: component.tier,
    assessment_style: component.internally_assessed ? "coursework" : "written",
    private_candidate_eligible: component.private_candidate_eligible,
    note: component.note,
    marks: component.marks,
  }));
  const entryRoutes = buildEntryRoutes(assessment.components, tiers);
  const assessmentObjectives = parseAssessmentObjectives(items).map((objective) => ({ ...objective, rubric: [] }));
  const commandWords = parseCommandWords(items);
  const warnings = [...parsed.warnings, ...assessment.warnings];
  if (entryRoutes.length === 0) warnings.push("No private candidate entry route could be built from the papers.");

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
      tiers,
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
        "Topics, objectives, papers, entry routes, assessment objectives and command words all come from the PDF.",
    },
    files: {
      topics: "topics.json",
      objectives: "objectives.json",
      routes: "routes.json",
      assessment_objectives: "assessment_objectives.json",
      entry_routes: "entry_routes.json",
      command_words: "command_words.json",
      resources: "resources.json",
      lineage: "lineage.json",
    },
    counts: {
      topics: topics.length,
      subtopics: topics.reduce((sum, topic) => sum + topic.subtopics.length, 0),
      objectives: objectives.length,
      components: routes.length,
      assessment_objectives: assessmentObjectives.length,
    },
    generated_at: new Date().toISOString(),
  };

  for (const warning of warnings) console.warn(`warning: ${warning}`);

  // A previous package in the same folder: keep its resources by following the objective lineage.
  const previous = (file: string): unknown[] => {
    const target = path.join(outDir, file);
    return existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as unknown[]) : [];
  };
  const previousManifest = existsSync(path.join(outDir, "manifest.json"))
    ? (JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8")) as { provenance?: { verified?: boolean } })
    : null;
  if (previousManifest?.provenance?.verified && !args.force && !args.dryRun) {
    throw new Error(
      `${slug} has been reviewed and verified. Re-extracting would discard the reviewer's edits; pass --force to do it anyway.`,
    );
  }
  const previousObjectives = previous("objectives.json") as Array<{ objective_code: string; objective_text: string }>;
  const lineage = proposeLineage(previousObjectives, objectives);
  const { kept: resources, dropped } = remapResources(
    previous("resources.json") as Array<{ objective_code: string; title?: string }>,
    lineage,
    new Set(objectives.map((objective) => objective.objective_code)),
  );
  if (previousObjectives.length > 0) {
    console.log(
      `Lineage: ${lineage.filter((row) => row.to_code).length} of ${previousObjectives.length} earlier objectives matched; ` +
        `${resources.length} resources kept, ${dropped.length} parked in resources_unmapped.json for review.`,
    );
    for (const resource of dropped)
      console.log(`  unmapped resource: ${resource.title ?? "(untitled)"} (${resource.objective_code})`);
  }

  if (args.dryRun) {
    console.log(
      `Dry run: ${topics.length} topics, ${objectives.length} objectives, ${routes.length} papers, ` +
        `${entryRoutes.length} entry route(s), ${assessmentObjectives.length} AOs, ${commandWords.length} command words.`,
    );
    return;
  }

  await mkdir(outDir, { recursive: true });
  const write = (file: string, value: unknown) =>
    writeFile(path.join(outDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");

  await write("manifest.json", manifest);
  await write("topics.json", topics);
  await write("objectives.json", objectives);
  await write("routes.json", routes);
  await write("assessment_objectives.json", assessmentObjectives);
  await write("entry_routes.json", entryRoutes);
  await write("command_words.json", commandWords);
  await write("resources.json", resources);
  await write("lineage.json", lineage);
  await write("resources_unmapped.json", dropped);

  console.log(
    `Wrote ${path.relative(ROOT, outDir)}: ${topics.length} topics, ` +
      `${manifest.counts.subtopics} subtopics, ${objectives.length} objectives.`,
  );
  console.log("Review the package on /parent/curriculum before marking it verified.");
}

main().catch((error: unknown) => {
  console.error(`\nIngestion failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
