import { z } from "zod";

/**
 * Contracts for the files the extraction pipeline writes. Every importer and
 * API route validates against these before touching the database.
 */

export const SCHEMA_VERSION = "2.0.0";

export const tierSchema = z.enum(["Core", "Extended", "Both", "Untiered"]);

export const provenanceSchema = z.object({
  method: z.enum(["pdf-extraction", "manual-draft"]),
  source_file: z.string().min(1),
  extracted_at: z.string().min(1),
  verified: z.boolean(),
  notes: z.string().default(""),
  /** Who checked the extraction against the PDF, and when (package review screen). */
  reviewed_by: z.string().nullable().default(null),
  reviewed_at: z.string().nullable().default(null),
});

export const manifestSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  package_id: z.string().min(1),
  subject: z.object({
    code: z.string().regex(/^\d{4}$/, "Subject codes are four digits"),
    slug: z.string().min(1),
    name: z.string().min(1),
    qualification: z.string().min(1),
    awarding_body: z.string().min(1),
    version_label: z.string().min(1),
    exam_series: z.array(z.string().min(1)).min(1),
    tiers: z.array(tierSchema).min(1),
    grade_scale: z.string().min(1),
    mastery_mode: z.enum(["objective-mastery", "skill-rubric", "source-and-essay"]),
    is_elective: z.boolean().default(false),
  }),
  provenance: provenanceSchema,
  files: z.record(z.string(), z.string()).default({}),
  counts: z
    .object({
      topics: z.number().int().nonnegative(),
      subtopics: z.number().int().nonnegative(),
      objectives: z.number().int().nonnegative(),
      components: z.number().int().nonnegative(),
      assessment_objectives: z.number().int().nonnegative(),
    })
    .default({ topics: 0, subtopics: 0, objectives: 0, components: 0, assessment_objectives: 0 }),
  generated_at: z.string().min(1),
});

export const routesSchema = z.array(
  z.object({
    component_code: z.string().min(1),
    name: z.string().min(1),
    duration_minutes: z.number().int().positive().nullable(),
    weighting_percent: z.number().min(0).max(100).nullable(),
    tier: tierSchema,
    assessment_style: z.string().min(1),
    private_candidate_eligible: z.boolean(),
    note: z.string().default(""),
    /** Printed total marks for the paper; null for older hand-written packages. */
    marks: z.number().int().positive().nullable().default(null),
  }),
);

/** Which papers a candidate sits together. Weightings of a route's papers sum to 100. */
export const entryRoutesSchema = z.array(
  z.object({
    route_code: z.string().min(1),
    name: z.string().min(1),
    tier: tierSchema,
    private_candidate_eligible: z.boolean(),
    component_codes: z.array(z.string().min(1)).min(1),
  }),
);

/** The syllabus's own command-word glossary. */
export const commandWordsSchema = z.array(
  z.object({
    word: z.string().min(1),
    meaning: z.string().min(1),
  }),
);

export const assessmentObjectivesSchema = z.array(
  z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    weighting_percent: z.number().min(0).max(100).nullable(),
    rubric: z.array(z.string().min(1)).default([]),
  }),
);

export const topicsSchema = z.array(
  z.object({
    topic_code: z.string().min(1),
    name: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    subtopics: z.array(
      z.object({
        topic_code: z.string().min(1),
        name: z.string().min(1),
        sequence: z.number().int().nonnegative(),
      }),
    ),
  }),
);

export const COMMAND_WORDS = [
  "Analyse",
  "Annotate",
  "Apply",
  "Calculate",
  "Compare",
  "Complete",
  "Construct",
  "Convert",
  "Define",
  "Derive",
  "Describe",
  "Design",
  "Determine",
  "Discuss",
  "Draw",
  "Estimate",
  "Evaluate",
  "Explain",
  "Give",
  "Identify",
  "Interpret",
  "Justify",
  "Label",
  "Measure",
  "Name",
  "Outline",
  "Plot",
  "Predict",
  "Recognise",
  "Relate",
  "Simplify",
  "Sketch",
  "Solve",
  "State",
  "Structure",
  "Suggest",
  "Summarise",
  "Understand",
  "Use",
  "Vary",
  "Write",
  "Organise",
] as const;

/** The command word an objective opens with, or "" when it opens with something else. */
export function commandWordOf(text: string): (typeof COMMAND_WORDS)[number] | "" {
  const first = text.trim().split(/[\s,.:;]/)[0] ?? "";
  return COMMAND_WORDS.find((word) => word.toLowerCase() === first.toLowerCase()) ?? "";
}

export const objectivesSchema = z.array(
  z.object({
    objective_code: z.string().min(1),
    topic_code: z.string().min(1),
    objective_text: z.string().min(8),
    command_word: z.union([z.enum(COMMAND_WORDS), z.literal("")]),
    tier: tierSchema,
    sequence: z.number().int().nonnegative(),
    /** Core and Extended wording differ, so the supplement is kept apart. */
    supplement_text: z.string().nullable().default(null),
    /** PDF page the objective is printed on, for side-by-side review. */
    source_page: z.number().int().positive().nullable().default(null),
  }),
);

/** Old objective code to new, proposed by wording and confirmed by a person. */
export const lineageSchema = z.array(
  z.object({
    from_code: z.string().min(1),
    /** The old wording, so a reviewer can judge the match after the old package is gone. */
    from_text: z.string().default(""),
    /** Null: no confident match yet; the reviewer picks one or removes the row. */
    to_code: z.string().min(1).nullable(),
    method: z.enum(["unchanged", "text-match", "manual"]),
    score: z.number().min(0).max(1),
    confirmed: z.boolean(),
  }),
);

export const resourcesSchema = z.array(
  z.object({
    objective_code: z.string().min(1),
    title: z.string().min(1),
    resource_type: z.enum([
      "YouTubeVideo",
      "OpenStaxReading",
      "LibreTextsReading",
      "CSFieldGuideReading",
      "CK12FlexBook",
      "PhETSim",
    ]),
    provider: z.string().default(""),
    external_url: z.url(),
    youtube_video_id: z
      .string()
      .regex(/^[\w-]{11}$/)
      .nullable()
      .default(null),
    start_timestamp_seconds: z.number().int().min(0).nullable().default(null),
    end_timestamp_seconds: z.number().int().min(0).nullable().default(null),
    is_sandboxed: z.boolean().default(true),
    citation_reference: z.string().default(""),
  }),
);

export const curriculumPackageSchema = z.object({
  manifest: manifestSchema,
  routes: routesSchema,
  entryRoutes: entryRoutesSchema.default([]),
  commandWords: commandWordsSchema.default([]),
  assessmentObjectives: assessmentObjectivesSchema,
  topics: topicsSchema,
  objectives: objectivesSchema,
  resources: resourcesSchema.default([]),
  lineage: lineageSchema.default([]),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type Route = z.infer<typeof routesSchema>[number];
export type EntryRoute = z.infer<typeof entryRoutesSchema>[number];
export type LineageEntry = z.infer<typeof lineageSchema>[number];
export type CommandWord = z.infer<typeof commandWordsSchema>[number];
export type AssessmentObjective = z.infer<typeof assessmentObjectivesSchema>[number];
export type TopicNode = z.infer<typeof topicsSchema>[number];
export type LearningObjective = z.infer<typeof objectivesSchema>[number];
export type LearningResource = z.infer<typeof resourcesSchema>[number];
export type CurriculumPackage = z.infer<typeof curriculumPackageSchema>;

/** Cross-file integrity that a per-file schema cannot express. */
export function validatePackageIntegrity(pkg: CurriculumPackage): string[] {
  const problems: string[] = [];
  const subtopics = new Set(pkg.topics.flatMap((topic) => topic.subtopics.map((sub) => sub.topic_code)));
  const objectives = new Set<string>();

  const papers = new Map(pkg.routes.map((route) => [route.component_code, route]));
  for (const route of pkg.entryRoutes) {
    const missing = route.component_codes.filter((code) => !papers.has(code));
    if (missing.length > 0) problems.push(`entry route ${route.route_code}: unknown component ${missing.join(", ")}`);
    const total = route.component_codes.reduce((sum, code) => sum + (papers.get(code)?.weighting_percent ?? 0), 0);
    if (missing.length === 0 && total !== 100)
      problems.push(`entry route ${route.route_code}: weightings sum to ${total}, not 100`);
  }

  for (const objective of pkg.objectives) {
    if (!subtopics.has(objective.topic_code)) {
      problems.push(`${objective.objective_code}: unknown topic ${objective.topic_code}`);
    }
    if (objectives.has(objective.objective_code)) {
      problems.push(`${objective.objective_code}: duplicate objective code`);
    }
    objectives.add(objective.objective_code);
  }

  const { counts } = pkg.manifest;
  if (counts.topics !== pkg.topics.length)
    problems.push(`manifest counts.topics is ${counts.topics}, found ${pkg.topics.length}`);
  const subtopicCount = pkg.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0);
  if (counts.subtopics !== subtopicCount)
    problems.push(`manifest counts.subtopics is ${counts.subtopics}, found ${subtopicCount}`);
  if (counts.objectives !== pkg.objectives.length)
    problems.push(`manifest counts.objectives is ${counts.objectives}, found ${pkg.objectives.length}`);
  if (counts.components !== pkg.routes.length)
    problems.push(`manifest counts.components is ${counts.components}, found ${pkg.routes.length}`);
  if (counts.assessment_objectives !== pkg.assessmentObjectives.length) {
    problems.push(
      `manifest counts.assessment_objectives is ${counts.assessment_objectives}, found ${pkg.assessmentObjectives.length}`,
    );
  }

  // Extracted packages list alternative papers too; their declared entry routes are checked above instead.
  const weighted = pkg.routes.reduce((sum, route) => sum + (route.weighting_percent ?? 0), 0);
  if (pkg.entryRoutes.length === 0 && pkg.routes.length > 0 && Math.abs(weighted - 100) > 0.5) {
    const candidates = pkg.routes.some((route) => route.weighting_percent === null);
    if (!candidates) problems.push(`Route weightings total ${weighted}%, expected 100%`);
  }

  return problems;
}
