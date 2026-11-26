import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { curriculumPackageSchema, validatePackageIntegrity, type CurriculumPackage } from "./schemas";

export type ImportAction = "inserted" | "updated" | "skipped";

export type ImportStep = {
  step: string;
  table: string;
  action: ImportAction;
  detail: string;
};

export type ImportResult = {
  packageId: string;
  subjectCode: string;
  versionLabel: string;
  verified: boolean;
  steps: ImportStep[];
  warnings: string[];
};

export class PackageImportError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = "PackageImportError";
  }
}

const PACKAGE_ROOT = path.resolve(process.cwd(), "curriculum-packages");

/** Subject category drives how the planner groups subjects. */
export const SUBJECT_CATEGORY: Record<string, "STEM" | "Languages" | "Humanities" | "Creative_Elective"> = {
  "0580": "STEM",
  "0478": "STEM",
  "0610": "STEM",
  "0620": "STEM",
  "0625": "STEM",
  "0500": "Humanities",
  "0460": "Humanities",
  "0470": "Humanities",
  "0455": "Humanities",
  "0530": "Languages",
  "0520": "Languages",
};

/** Cambridge component styles, mapped onto the schema's allowed values. */
function assessmentTypeFor(componentCode: string): string {
  if (componentCode === "6") return "AlternativeToPractical";
  if (componentCode === "4") return "AlternativeToCoursework";
  if (componentCode === "3") return "Speaking";
  return "Written";
}

/** Package resource kinds, mapped onto the schema's allowed values. */
function resourceTypeFor(kind: string): string {
  if (kind === "YouTubeVideo") return "YouTubeVideo";
  if (kind === "PhETSim") return "PhETSim";
  if (kind === "PastPaperReference" || kind === "TriviaDoc") return kind;
  return "OER_Reading";
}

function activityTypeFor(kind: string): string {
  if (kind === "YouTubeVideo") return "Video";
  if (kind === "PhETSim") return "PracticalSim";
  if (kind === "PastPaperReference") return "SpacedReview";
  return "Reading";
}

function yearsFromLabel(versionLabel: string): { start: number; end: number } | null {
  const match = versionLabel.match(/(\d{4})\D+(\d{4})/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

export function resolvePackageDir(packageId: string) {
  if (!/^[a-z0-9-]+$/.test(packageId)) {
    throw new PackageImportError(`Invalid package id: ${packageId}`);
  }
  return path.join(PACKAGE_ROOT, packageId);
}

async function readJson(dir: string, file: string) {
  const raw = await readFile(path.join(dir, file), "utf8");
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new PackageImportError(`${file} is not valid JSON`, [(error as Error).message]);
  }
}

/** An optional package file: missing means empty, but malformed JSON still fails loudly. */
async function readOptionalJson(dir: string, file: string) {
  try {
    return await readJson(dir, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Reads and validates one package folder. Throws with every problem found. */
export async function readPackage(dir: string): Promise<CurriculumPackage> {
  const [manifest, routes, entryRoutes, commandWords, assessmentObjectives, topics, objectives, resources] =
    await Promise.all([
      readJson(dir, "manifest.json"),
      readJson(dir, "routes.json"),
      readOptionalJson(dir, "entry_routes.json"),
      readOptionalJson(dir, "command_words.json"),
      readJson(dir, "assessment_objectives.json"),
      readJson(dir, "topics.json"),
      readJson(dir, "objectives.json"),
      readOptionalJson(dir, "resources.json"),
    ]);
  const lineage = await readOptionalJson(dir, "lineage.json");

  const parsed = curriculumPackageSchema.safeParse({
    manifest,
    routes,
    entryRoutes,
    commandWords,
    assessmentObjectives,
    topics,
    objectives,
    resources,
    lineage,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new PackageImportError("Package failed schema validation", problems);
  }

  const problems = validatePackageIntegrity(parsed.data);
  if (problems.length > 0) {
    throw new PackageImportError("Package failed integrity checks", problems);
  }

  return parsed.data;
}

type IdRow = { id: string };

/** Upserts a row on its natural key and returns the id. */
async function upsertId(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<string> {
  const { data, error } = await client.from(table).upsert(row, { onConflict }).select("id").single<IdRow>();

  if (error) throw new PackageImportError(`${table}: ${error.message}`);
  return data.id;
}

/** Inserts only when the natural key is missing, so reruns stay quiet. */
async function ensureRow(
  client: SupabaseClient,
  table: string,
  match: Record<string, unknown>,
  row: Record<string, unknown>,
): Promise<string> {
  let query = client.from(table).select("id").limit(1);
  for (const [column, value] of Object.entries(match)) query = query.eq(column, value);

  const { data: existing, error: readError } = await query.maybeSingle<IdRow>();
  if (readError) throw new PackageImportError(`${table}: ${readError.message}`);
  if (existing) return existing.id;

  const { data, error } = await client.from(table).insert(row).select("id").single<IdRow>();
  if (error) throw new PackageImportError(`${table}: ${error.message}`);
  return data.id;
}

/**
 * Writes one package into the curriculum hierarchy. Every write is an upsert on
 * a natural key, so running the same package twice leaves the same rows.
 */
export async function importPackage(
  client: SupabaseClient,
  pkg: CurriculumPackage,
  options: { allowDraft?: boolean; dryRun?: boolean } = {},
): Promise<ImportResult> {
  const { manifest } = pkg;
  const warnings: string[] = [];

  if (!manifest.provenance.verified && !options.allowDraft) {
    throw new PackageImportError(
      `${manifest.package_id} is a draft (${manifest.provenance.method}). ` +
        "Run the PDF extraction pipeline, or pass allowDraft to import it knowingly.",
    );
  }
  if (!manifest.provenance.verified) {
    warnings.push(
      `Draft package: objectives came from ${manifest.provenance.source_file} and are not extraction-verified.`,
    );
  }

  const years = yearsFromLabel(manifest.subject.version_label);
  if (!years) warnings.push(`Version label "${manifest.subject.version_label}" does not contain a year range.`);

  const steps: ImportStep[] = [];
  const note = (step: string, table: string, action: ImportAction, detail: string) =>
    steps.push({ step, table, action, detail });

  if (options.dryRun) {
    note("validate", "-", "skipped", "dry run: schema and integrity checks passed");
    return {
      packageId: manifest.package_id,
      subjectCode: manifest.subject.code,
      versionLabel: manifest.subject.version_label,
      verified: manifest.provenance.verified,
      steps,
      warnings,
    };
  }

  const awardingBodyId = await upsertId(
    client,
    "awarding_bodies",
    { code: "CAIE", name: manifest.subject.awarding_body, website: "https://www.cambridgeinternational.org" },
    "code",
  );
  note("awarding body", "awarding_bodies", "inserted", manifest.subject.awarding_body);

  const qualificationId = await upsertId(
    client,
    "qualifications",
    { awarding_body_id: awardingBodyId, code: "CAIE-IGCSE", name: manifest.subject.qualification },
    "code",
  );
  note("qualification", "qualifications", "inserted", manifest.subject.qualification);

  const category = SUBJECT_CATEGORY[manifest.subject.code] ?? "STEM";
  const subjectId = await ensureRow(
    client,
    "subjects",
    { qualification_id: qualificationId, subject_code: manifest.subject.code },
    {
      qualification_id: qualificationId,
      subject_code: manifest.subject.code,
      subject_name: manifest.subject.name,
      slug: manifest.subject.slug,
      category,
      mastery_mode: manifest.subject.mastery_mode === "skill-rubric" ? "skill_rubric" : "topic_objective",
      is_core: !manifest.subject.is_elective,
    },
  );

  // The slug and display name can legitimately change; keep them current.
  const { error: subjectUpdateError } = await client
    .from("subjects")
    .update({ subject_name: manifest.subject.name, slug: manifest.subject.slug, category })
    .eq("id", subjectId);
  if (subjectUpdateError) throw new PackageImportError(`subjects: ${subjectUpdateError.message}`);
  note("subject", "subjects", "inserted", `${manifest.subject.code} ${manifest.subject.name}`);

  const syllabusVersionId = await upsertId(
    client,
    "syllabus_versions",
    {
      subject_id: subjectId,
      version_label: manifest.subject.version_label,
      exam_year_start: years?.start ?? new Date().getFullYear(),
      exam_year_end: years?.end ?? new Date().getFullYear() + 2,
      available_tiers: manifest.subject.tiers,
      exam_series: manifest.subject.exam_series,
      status: manifest.provenance.verified ? "active" : "draft",
      source_pdf_hash: null,
    },
    "subject_id,version_label",
  );
  note("syllabus version", "syllabus_versions", "inserted", manifest.subject.version_label);

  const componentIds = new Map<string, string>();
  for (const route of pkg.routes) {
    const componentId = await upsertId(
      client,
      "components",
      {
        syllabus_version_id: syllabusVersionId,
        component_code: route.component_code,
        name: route.name,
        assessment_type: assessmentTypeFor(route.component_code),
        duration_minutes: route.duration_minutes ?? 0,
        max_marks: route.marks,
        private_candidate_eligible: route.private_candidate_eligible,
        notes: route.note || null,
      },
      "syllabus_version_id,component_code",
    );
    componentIds.set(route.component_code, componentId);
  }
  note("components", "components", "inserted", `${pkg.routes.length} paper(s)`);

  // Extracted packages declare their entry routes; older hand-written ones get one route of every eligible paper.
  const declared =
    pkg.entryRoutes.length > 0
      ? pkg.entryRoutes
      : (() => {
          const eligible = pkg.routes.filter((route) => route.private_candidate_eligible);
          return eligible.length === 0
            ? []
            : [
                {
                  route_code: "PRIVATE",
                  name: "Private candidate route",
                  tier: pkg.manifest.subject.tiers.length === 1 ? pkg.manifest.subject.tiers[0]! : "Extended",
                  private_candidate_eligible: true,
                  component_codes: eligible.map((route) => route.component_code),
                },
              ];
        })();

  for (const entryRoute of declared) {
    const routeId = await upsertId(
      client,
      "entry_routes",
      {
        syllabus_version_id: syllabusVersionId,
        route_code: entryRoute.route_code,
        name: entryRoute.name,
        tier: entryRoute.tier,
        private_candidate_eligible: entryRoute.private_candidate_eligible,
        notes: "Excludes any component that needs school-authenticated coursework.",
      },
      "syllabus_version_id,route_code",
    );

    const keep: string[] = [];
    for (const code of entryRoute.component_codes) {
      const componentId = componentIds.get(code);
      if (!componentId)
        throw new PackageImportError(`Entry route ${entryRoute.route_code} names unknown paper ${code}`);
      keep.push(componentId);
      const paper = pkg.routes.find((route) => route.component_code === code);
      const { error } = await client
        .from("entry_route_components")
        .upsert(
          { entry_route_id: routeId, component_id: componentId, weighting_percent: paper?.weighting_percent ?? null },
          { onConflict: "entry_route_id,component_id" },
        );
      if (error) throw new PackageImportError(`entry_route_components: ${error.message}`);
    }
    // A re-import replaces the route's papers rather than accumulating stale ones.
    const { error: pruneError } = await client
      .from("entry_route_components")
      .delete()
      .eq("entry_route_id", routeId)
      .not("component_id", "in", `(${keep.join(",")})`);
    if (pruneError) throw new PackageImportError(`entry_route_components: ${pruneError.message}`);
    note(
      "entry route",
      "entry_routes",
      "inserted",
      `${entryRoute.route_code}: ${entryRoute.component_codes.length} paper(s)`,
    );
  }
  if (declared.length === 0) warnings.push("No private candidate route declared for this package.");

  for (const word of pkg.commandWords) {
    const { error } = await client
      .from("command_words")
      .upsert(
        { syllabus_version_id: syllabusVersionId, word: word.word, meaning: word.meaning },
        { onConflict: "syllabus_version_id,word" },
      );
    if (error) throw new PackageImportError(`command_words: ${error.message}`);
  }
  if (pkg.commandWords.length > 0)
    note("command words", "command_words", "inserted", `${pkg.commandWords.length} word(s)`);

  for (const objective of pkg.assessmentObjectives) {
    const { error } = await client.from("assessment_objectives").upsert(
      {
        syllabus_version_id: syllabusVersionId,
        code: objective.code,
        name: objective.name,
        description: objective.description,
        weighting_percent: objective.weighting_percent,
        rubric: objective.rubric,
      },
      { onConflict: "syllabus_version_id,code" },
    );
    if (error) throw new PackageImportError(`assessment_objectives: ${error.message}`);
  }
  note("assessment objectives", "assessment_objectives", "inserted", `${pkg.assessmentObjectives.length} AO(s)`);

  // Step 6.4: objectives this package replaces are retired, not overwritten. A code that
  // survives with a different meaning would otherwise drag a learner's history onto the
  // wrong objective, so the old row is renamed aside and the new one inserted fresh.
  const { data: existingTopics, error: topicReadError } = await client
    .from("topics")
    .select("id, topic_code, retired_at")
    .eq("syllabus_version_id", syllabusVersionId);
  if (topicReadError) throw new PackageImportError(`topics: ${topicReadError.message}`);
  const existingTopicIds = (existingTopics ?? []).map((row) => row.id as string);
  const { data: existingObjectives, error: objectiveReadError } = existingTopicIds.length
    ? await client.from("learning_objectives").select("id, objective_code, retired_at").in("topic_id", existingTopicIds)
    : { data: [], error: null };
  if (objectiveReadError) throw new PackageImportError(`learning_objectives: ${objectiveReadError.message}`);

  const newCodes = new Set(pkg.objectives.map((objective) => objective.objective_code));
  const changedMeaning = new Set(pkg.lineage.filter((row) => row.method !== "unchanged").map((row) => row.from_code));
  const retiredIds = new Map<string, string>();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (const row of (existingObjectives ?? []) as Array<{
    id: string;
    objective_code: string;
    retired_at: string | null;
  }>) {
    if (row.retired_at) {
      // Retired by an earlier import: still a valid source for links confirmed since.
      const original = row.objective_code.replace(/~retired-\d{8}$/, "");
      if (!retiredIds.has(original)) retiredIds.set(original, row.id);
      continue;
    }
    if (newCodes.has(row.objective_code) && !changedMeaning.has(row.objective_code)) continue;
    const { error } = await client
      .from("learning_objectives")
      .update({ objective_code: `${row.objective_code}~retired-${stamp}`, retired_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new PackageImportError(`retire ${row.objective_code}: ${error.message}`);
    retiredIds.set(row.objective_code, row.id);
  }
  if (retiredIds.size > 0) note("retire", "learning_objectives", "updated", `${retiredIds.size} objective(s) retired`);

  const packageTopicCodes = new Set(
    pkg.topics.flatMap((topic) => [topic.topic_code, ...topic.subtopics.map((sub) => sub.topic_code)]),
  );
  const staleTopics = (existingTopics ?? []).filter(
    (row) => !row.retired_at && !packageTopicCodes.has(row.topic_code as string),
  );
  if (staleTopics.length > 0) {
    const { error } = await client
      .from("topics")
      .update({ retired_at: new Date().toISOString() })
      .in(
        "id",
        staleTopics.map((row) => row.id as string),
      );
    if (error) throw new PackageImportError(`retire topics: ${error.message}`);
    note("retire", "topics", "updated", `${staleTopics.length} topic(s) retired`);
  }

  const topicIds = new Map<string, string>();
  for (const topic of pkg.topics) {
    const topicId = await upsertId(
      client,
      "topics",
      {
        syllabus_version_id: syllabusVersionId,
        parent_topic_id: null,
        topic_code: topic.topic_code,
        name: topic.name,
        sequence: topic.sequence,
        retired_at: null,
      },
      "syllabus_version_id,topic_code",
    );
    topicIds.set(topic.topic_code, topicId);

    for (const subtopic of topic.subtopics) {
      const subId = await upsertId(
        client,
        "topics",
        {
          syllabus_version_id: syllabusVersionId,
          parent_topic_id: topicId,
          topic_code: subtopic.topic_code,
          name: subtopic.name,
          sequence: subtopic.sequence,
          retired_at: null,
        },
        "syllabus_version_id,topic_code",
      );
      topicIds.set(subtopic.topic_code, subId);
    }
  }
  note("topics", "topics", "inserted", `${topicIds.size} topic row(s)`);

  const objectiveIds = new Map<string, string>();
  for (const objective of pkg.objectives) {
    const topicId = topicIds.get(objective.topic_code);
    if (!topicId) throw new PackageImportError(`Missing topic for ${objective.objective_code}`);

    const objectiveId = await upsertId(
      client,
      "learning_objectives",
      {
        topic_id: topicId,
        objective_code: objective.objective_code,
        summary_title: objective.objective_text.slice(0, 120),
        official_description: objective.objective_text,
        supplement_text: objective.supplement_text,
        command_words: objective.command_word ? [objective.command_word] : [],
        tier: objective.tier,
        sequence: objective.sequence,
        retired_at: null,
      },
      "topic_id,objective_code",
    );
    objectiveIds.set(objective.objective_code, objectiveId);
  }
  note("objectives", "learning_objectives", "inserted", `${pkg.objectives.length} objective(s)`);

  // Confirmed links from retired objectives to their successors. Progress moves only
  // when a guardian runs carry_over_objective_progress() from the curriculum screen.
  let links = 0;
  for (const row of pkg.lineage) {
    if (!row.confirmed || !row.to_code) continue;
    const fromId = retiredIds.get(row.from_code);
    const toId = objectiveIds.get(row.to_code);
    if (!fromId || !toId || fromId === toId) continue;
    const { error } = await client
      .from("objective_lineage")
      .upsert(
        {
          from_objective_id: fromId,
          to_objective_id: toId,
          method: row.method,
          confirmed_by: pkg.manifest.provenance.reviewed_by,
        },
        { onConflict: "from_objective_id" },
      );
    if (error) throw new PackageImportError(`objective_lineage: ${error.message}`);
    links += 1;
  }
  if (links > 0) note("lineage", "objective_lineage", "inserted", `${links} link(s)`);

  let resourceCount = 0;
  for (const resource of pkg.resources) {
    const objectiveId = objectiveIds.get(resource.objective_code);
    if (!objectiveId) {
      warnings.push(`Resource "${resource.title}" points at an unknown objective and was skipped.`);
      continue;
    }

    const resourceId = await upsertId(
      client,
      "resources",
      {
        learning_objective_id: objectiveId,
        title: resource.title,
        resource_type: resourceTypeFor(resource.resource_type),
        external_url: resource.external_url,
        youtube_video_id: resource.youtube_video_id,
        start_timestamp_seconds: resource.start_timestamp_seconds ?? 0,
        end_timestamp_seconds: resource.end_timestamp_seconds,
        is_sandboxed: resource.is_sandboxed,
        provider: resource.provider,
        citation: resource.citation_reference,
      },
      "learning_objective_id,external_url",
    );

    await upsertId(
      client,
      "activities",
      {
        objective_id: objectiveId,
        resource_id: resourceId,
        activity_type: activityTypeFor(resource.resource_type),
        title: resource.title,
        instructions: null,
        estimated_minutes: resource.resource_type === "YouTubeVideo" ? 15 : 20,
        difficulty: "Standard",
        sequence: resourceCount,
      },
      "objective_id,title",
    );

    resourceCount += 1;
  }
  note("resources", "resources", "inserted", `${resourceCount} resource(s)`);

  return {
    packageId: manifest.package_id,
    subjectCode: manifest.subject.code,
    versionLabel: manifest.subject.version_label,
    verified: manifest.provenance.verified,
    steps,
    warnings,
  };
}
