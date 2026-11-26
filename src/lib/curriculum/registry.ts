/**
 * The subject registry. This is configuration, not syllabus content: it lists
 * which Cambridge syllabuses this student sits, the version label to extract,
 * and the entry route a private candidate uses. Objectives and topic trees are
 * never authored here. They come from the PDF extraction pipeline.
 */

export type EntryRouteStatus = "specified" | "pending-extraction";

export type SpecifiedComponent = {
  component_code: string;
  name: string;
  duration_minutes: number | null;
  weighting_percent: number | null;
  tier: "Core" | "Extended" | "Both" | "Untiered";
  private_candidate_eligible: boolean;
  note?: string;
};

export type RegistrySubject = {
  code: string;
  slug: string;
  name: string;
  qualification: string;
  version_label: string;
  version_notes: string;
  exam_series: string[];
  tiers: Array<"Core" | "Extended" | "Untiered">;
  is_elective: boolean;
  private_candidate: {
    route_status: EntryRouteStatus;
    components: SpecifiedComponent[];
    note: string;
  };
  /** Official syllabus outline page, used by the downloader and by the UI. */
  syllabus_page: string;
  /** Expected file in raw-syllabuses/. Null means download from syllabus_page. */
  pdf_hint: string;
  /** How the PDF prints its subject content; picks the parser strategy in scripts/lib/syllabusParser.ts. */
  content_layout: "decimal" | "science" | "maths" | "cs" | "history" | "skills";
};

export const registry: RegistrySubject[] = [
  {
    code: "0580",
    slug: "mathematics",
    name: "Mathematics",
    qualification: "Cambridge IGCSE",
    version_label: "2028-2030",
    version_notes: "Version 2 of the syllabus. Core and Extended tiers.",
    exam_series: ["June", "November"],
    tiers: ["Core", "Extended"],
    is_elective: false,
    private_candidate: {
      route_status: "pending-extraction",
      components: [],
      note: "Component list is taken from the 2028-2030 PDF, not assumed.",
    },
    syllabus_page:
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-mathematics-0580/",
    pdf_hint: "0580-mathematics-2028-2030.pdf",
    content_layout: "maths",
  },
  {
    code: "0478",
    slug: "computer-science",
    name: "Computer Science",
    qualification: "Cambridge IGCSE",
    version_label: "2026-2028",
    version_notes: "Transition path to the 2029 syllabus; both are extracted separately.",
    exam_series: ["June", "November"],
    tiers: ["Core", "Extended"],
    is_elective: false,
    private_candidate: {
      route_status: "pending-extraction",
      components: [],
      note: "Papers 1 and 2 apply to both tiers. Confirm against the PDF before entry.",
    },
    syllabus_page:
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-computer-science-0478/",
    pdf_hint: "0478-computer-science-2026-2028.pdf",
    content_layout: "cs",
  },
  {
    code: "0610",
    slug: "biology",
    name: "Biology",
    qualification: "Cambridge IGCSE",
    version_label: "2026-2028",
    version_notes: "Extended tier with Paper 6 Alternative to Practical.",
    exam_series: ["June", "November"],
    tiers: ["Core", "Extended"],
    is_elective: false,
    private_candidate: {
      route_status: "specified",
      components: [
        {
          component_code: "2",
          name: "Paper 2 Multiple Choice (Extended)",
          duration_minutes: 45,
          weighting_percent: 30,
          tier: "Extended",
          private_candidate_eligible: true,
        },
        {
          component_code: "4",
          name: "Paper 4 Theory (Extended)",
          duration_minutes: 75,
          weighting_percent: 50,
          tier: "Extended",
          private_candidate_eligible: true,
        },
        {
          component_code: "6",
          name: "Paper 6 Alternative to Practical",
          duration_minutes: 60,
          weighting_percent: 20,
          tier: "Extended",
          private_candidate_eligible: true,
          note: "Replaces the practical examination for private candidates.",
        },
      ],
      note: "Extended tier only. Paper 6 removes the need for a school laboratory.",
    },
    syllabus_page: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-biology-0610/",
    pdf_hint: "0610-biology-2026-2028.pdf",
    content_layout: "science",
  },
  {
    code: "0620",
    slug: "chemistry",
    name: "Chemistry",
    qualification: "Cambridge IGCSE",
    version_label: "2026-2028",
    version_notes: "Extended tier with Paper 6 Alternative to Practical.",
    exam_series: ["June", "November"],
    tiers: ["Core", "Extended"],
    is_elective: false,
    private_candidate: {
      route_status: "specified",
      components: [
        {
          component_code: "2",
          name: "Paper 2 Multiple Choice (Extended)",
          duration_minutes: 45,
          weighting_percent: 30,
          tier: "Extended",
          private_candidate_eligible: true,
        },
        {
          component_code: "4",
          name: "Paper 4 Theory (Extended)",
          duration_minutes: 75,
          weighting_percent: 50,
          tier: "Extended",
          private_candidate_eligible: true,
        },
        {
          component_code: "6",
          name: "Paper 6 Alternative to Practical",
          duration_minutes: 60,
          weighting_percent: 20,
          tier: "Extended",
          private_candidate_eligible: true,
          note: "Replaces the practical examination for private candidates.",
        },
      ],
      note: "Extended tier only. Paper 6 removes the need for a school laboratory.",
    },
    syllabus_page:
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-chemistry-0620/",
    pdf_hint: "0620-chemistry-2026-2028.pdf",
    content_layout: "science",
  },
  {
    code: "0625",
    slug: "physics",
    name: "Physics",
    qualification: "Cambridge IGCSE",
    version_label: "2026-2028",
    version_notes: "Extended tier with Paper 6 Alternative to Practical.",
    exam_series: ["June", "November"],
    tiers: ["Core", "Extended"],
    is_elective: false,
    private_candidate: {
      route_status: "specified",
      components: [
        {
          component_code: "2",
          name: "Paper 2 Multiple Choice (Extended)",
          duration_minutes: 45,
          weighting_percent: 30,
          tier: "Extended",
          private_candidate_eligible: true,
        },
        {
          component_code: "4",
          name: "Paper 4 Theory (Extended)",
          duration_minutes: 75,
          weighting_percent: 50,
          tier: "Extended",
          private_candidate_eligible: true,
        },
        {
          component_code: "6",
          name: "Paper 6 Alternative to Practical",
          duration_minutes: 60,
          weighting_percent: 20,
          tier: "Extended",
          private_candidate_eligible: true,
          note: "Replaces the practical examination for private candidates.",
        },
      ],
      note: "Extended tier only. Paper 6 removes the need for a school laboratory.",
    },
    syllabus_page: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/",
    pdf_hint: "0625-physics-2026-2028.pdf",
    content_layout: "science",
  },
  {
    code: "0500",
    slug: "english-first-language",
    name: "English - First Language",
    qualification: "Cambridge IGCSE",
    version_label: "2027-2029",
    version_notes: "Untiered. Reading and writing components with a skill rubric.",
    exam_series: ["June", "November"],
    tiers: ["Untiered"],
    is_elective: false,
    private_candidate: {
      route_status: "pending-extraction",
      components: [],
      note: "The speaking and listening endorsement is optional; confirm the private candidate route in the PDF.",
    },
    syllabus_page:
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-first-language-0500/",
    pdf_hint: "0500-english-first-language-2027-2029.pdf",
    content_layout: "skills",
  },
  {
    code: "0460",
    slug: "geography",
    name: "Geography",
    qualification: "Cambridge IGCSE",
    version_label: "2027-2029",
    version_notes: "Revised structure: physical, human and Alternative to Coursework.",
    exam_series: ["June", "November"],
    tiers: ["Untiered"],
    is_elective: false,
    private_candidate: {
      route_status: "specified",
      components: [
        {
          component_code: "1",
          name: "Paper 1 Physical Geography",
          duration_minutes: 105,
          weighting_percent: 36,
          tier: "Untiered",
          private_candidate_eligible: true,
        },
        {
          component_code: "2",
          name: "Paper 2 Human Geography",
          duration_minutes: 105,
          weighting_percent: 36,
          tier: "Untiered",
          private_candidate_eligible: true,
        },
        {
          component_code: "4",
          name: "Paper 4 Alternative to Coursework",
          duration_minutes: 90,
          weighting_percent: 28,
          tier: "Untiered",
          private_candidate_eligible: true,
          note: "Replaces the coursework paper for private candidates.",
        },
      ],
      note: "Paper 4 is the only private candidate route; coursework is not available.",
    },
    syllabus_page:
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-geography-0460/",
    pdf_hint: "0460-geography-2027-2029.pdf",
    content_layout: "decimal",
  },
  {
    code: "0470",
    slug: "history",
    name: "History",
    qualification: "Cambridge IGCSE",
    version_label: "2027-2028",
    version_notes:
      "Social studies option. Cambridge publishes History 0470 in two documents, 2027-2028 and 2029-2030; this package is the 2027-2028 window.",
    exam_series: ["June", "November"],
    tiers: ["Untiered"],
    is_elective: false,
    private_candidate: {
      route_status: "specified",
      components: [
        {
          component_code: "1",
          name: "Paper 1 Written",
          duration_minutes: 120,
          weighting_percent: 40,
          tier: "Untiered",
          private_candidate_eligible: true,
        },
        {
          component_code: "2",
          name: "Paper 2 Written",
          duration_minutes: 120,
          weighting_percent: 33,
          tier: "Untiered",
          private_candidate_eligible: true,
        },
        {
          component_code: "4",
          name: "Paper 4 Alternative to Coursework",
          duration_minutes: 60,
          weighting_percent: 27,
          tier: "Untiered",
          private_candidate_eligible: true,
          note: "Replaces the coursework paper for private candidates.",
        },
      ],
      note: "Papers 1, 2 and 4 avoid school-authenticated coursework.",
    },
    syllabus_page: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-history-0470/",
    pdf_hint: "0470-history-2027-2028.pdf",
    content_layout: "history",
  },
  {
    code: "0455",
    slug: "economics",
    name: "Economics",
    qualification: "Cambridge IGCSE",
    version_label: "2027-2029",
    version_notes: "Social studies option. Untiered, examined entirely by written papers.",
    exam_series: ["June", "November"],
    tiers: ["Untiered"],
    is_elective: false,
    private_candidate: {
      route_status: "pending-extraction",
      components: [],
      note: "No coursework, so private entry is straightforward. Component weights come from the PDF.",
    },
    syllabus_page:
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-economics-0455/",
    pdf_hint: "0455-economics-2027-2029.pdf",
    content_layout: "decimal",
  },
  {
    code: "0530",
    slug: "spanish-foreign-language",
    name: "Spanish - Foreign Language",
    qualification: "Cambridge IGCSE",
    version_label: "2028-2030",
    version_notes: "Term elective. Skill-based assessment objectives across four skills.",
    exam_series: ["June", "November"],
    tiers: ["Untiered"],
    is_elective: true,
    private_candidate: {
      route_status: "specified",
      components: [
        {
          component_code: "1",
          name: "Paper 1 Listening",
          duration_minutes: 50,
          weighting_percent: 25,
          tier: "Untiered",
          private_candidate_eligible: true,
        },
        {
          component_code: "2",
          name: "Paper 2 Reading",
          duration_minutes: 60,
          weighting_percent: 25,
          tier: "Untiered",
          private_candidate_eligible: true,
        },
        {
          component_code: "3",
          name: "Paper 3 Speaking",
          duration_minutes: 15,
          weighting_percent: 25,
          tier: "Untiered",
          private_candidate_eligible: true,
          note: "Arranged with a local examiner for private candidates.",
        },
        {
          component_code: "4",
          name: "Paper 4 Writing",
          duration_minutes: 75,
          weighting_percent: 25,
          tier: "Untiered",
          private_candidate_eligible: true,
        },
      ],
      note: "Four equally weighted skills. French 0520 can be swapped in as the elective.",
    },
    syllabus_page:
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-spanish-foreign-language-0530/",
    pdf_hint: "0530-spanish-2028-2030.pdf",
    content_layout: "skills",
  },
];

export const coreSubjectCodes = registry.filter((subject) => !subject.is_elective).map((subject) => subject.code);

export const electiveSubjects = registry.filter((subject) => subject.is_elective);

export function getSubject(code: string): RegistrySubject | undefined {
  return registry.find((subject) => subject.code === code);
}

/** Route integrity check used by the importer and the parent term planner. */
export function assertPrivateCandidateRoute(subject: RegistrySubject) {
  if (subject.private_candidate.route_status !== "specified") return;
  const total = subject.private_candidate.components.reduce(
    (sum, component) => sum + (component.weighting_percent ?? 0),
    0,
  );
  if (Math.abs(total - 100) > 0.5) {
    throw new Error(`${subject.code}: private candidate components total ${total}%, expected 100%.`);
  }
}
