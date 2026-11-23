/**
 * Regenerates manifest.json and routes.json for every package folder from the
 * subject registry and the package's own topics/objectives files.
 *
 * Draft packages keep provenance.verified = false, and the importer refuses
 * them unless allowDraft is set.
 *
 * Usage: pnpm sync:packages
 */
import { cp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSubject } from "../src/lib/curriculum/registry";
import { SCHEMA_VERSION } from "../src/lib/curriculum/schemas";

const ROOT = process.cwd();
const PACKAGE_ROOT = path.join(ROOT, "curriculum-packages");

/** Old folder name -> new `<code>-<slug>-<years>` name. */
const RENAMES: Record<string, string> = {
  "cambridge-0478-cs": "0478-computer-science-2026-2028",
  "cambridge-0580-maths": "0580-mathematics-2028-2030",
  "cambridge-0610-biology": "0610-biology-2026-2028",
  "cambridge-0625-physics": "0625-physics-2026-2028",
  "cambridge-0500-english": "0500-english-first-language-2027-2029",
};

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  for (const [from, to] of Object.entries(RENAMES)) {
    const source = path.join(PACKAGE_ROOT, from);
    const target = path.join(PACKAGE_ROOT, to);
    try {
      await readdir(source);
    } catch {
      continue;
    }
    try {
      await readdir(target);
      await rm(source, { recursive: true, force: true });
    } catch {
      await rename(source, target);
    }
  }

  for (const entry of await readdir(PACKAGE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(PACKAGE_ROOT, entry.name);
    const code = entry.name.slice(0, 4);
    const subject = getSubject(code);
    if (!subject) {
      console.warn(`skip ${entry.name}: no registry entry for ${code}`);
      continue;
    }

    await rm(path.join(dir, "questions.json"), { force: true });

    const topics = await readJson(path.join(dir, "topics.json"));
    const objectives = await readJson(path.join(dir, "objectives.json"));

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
      package_id: entry.name,
      subject: {
        code: subject.code,
        slug: subject.slug,
        name: subject.name,
        qualification: subject.qualification,
        awarding_body: "Cambridge Assessment International Education",
        version_label: subject.version_label,
        exam_series: subject.exam_series,
        tiers: subject.tiers,
        grade_scale: "A*-G",
        mastery_mode: code === "0500" ? "skill-rubric" : "objective-mastery",
        is_elective: subject.is_elective,
      },
      provenance: {
        method: "manual-draft",
        source_file: `raw-syllabuses/${subject.pdf_hint}`,
        extracted_at: new Date().toISOString().slice(0, 10),
        verified: false,
        notes:
          "Draft content written before the extraction pipeline existed. " +
          "Replaced by `pnpm ingest --subject=<code>` once the official PDF is in raw-syllabuses/.",
      },
      files: {
        topics: "topics.json",
        objectives: "objectives.json",
        routes: "routes.json",
        assessment_objectives: "assessment_objectives.json",
      },
      counts: {
        topics: topics.length,
        subtopics: topics.reduce((sum: number, topic: { subtopics: unknown[] }) => sum + topic.subtopics.length, 0),
        objectives: objectives.length,
        components: routes.length,
        assessment_objectives: 0,
      },
      generated_at: new Date().toISOString(),
    };

    await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(path.join(dir, "routes.json"), `${JSON.stringify(routes, null, 2)}\n`, "utf8");
    await writeFile(path.join(dir, "assessment_objectives.json"), "[]\n", "utf8");

    console.log(
      `${entry.name}: draft, ${manifest.counts.topics} topics, ${manifest.counts.objectives} objectives, ${routes.length} components`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
