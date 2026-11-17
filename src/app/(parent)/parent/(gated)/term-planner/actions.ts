"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireGuardianSession } from "@/lib/auth/guardian-session";
import { getRouteOptions, replaceEnrollments } from "@/lib/data/enrollments";
import { getTerms, saveTerms } from "@/lib/data/terms";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const OPTIONAL_DATE = z.union([DATE, z.literal("")]).transform((value) => value || null);

const termSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Every term needs a name.").max(60),
    startsOn: DATE,
    endsOn: DATE,
    midtermWeekStart: OPTIONAL_DATE,
    finalWeekStart: OPTIONAL_DATE,
  })
  .superRefine((term, context) => {
    if (term.endsOn < term.startsOn) {
      context.addIssue({ code: "custom", message: `${term.name} ends before it starts.` });
    }
    for (const [label, value] of [
      ["mid-term week", term.midtermWeekStart],
      ["final week", term.finalWeekStart],
    ] as const) {
      if (value && (value < term.startsOn || value > term.endsOn)) {
        context.addIssue({ code: "custom", message: `The ${label} of ${term.name} falls outside the term.` });
      }
    }
  });

const planSchema = z.object({
  terms: z.array(termSchema).min(1).max(6),
  termId: z.string().uuid(),
  applyToAllTerms: z.boolean(),
  enrollments: z
    .array(
      z.object({
        routeId: z.string().uuid(),
        isElective: z.boolean(),
        weeklyMinutes: z.number().int().min(0).max(1500),
        targetGrade: z.string().trim().min(1).max(4),
        targetExamSeries: z.string().trim().max(40).nullable(),
      }),
    )
    .max(20),
});

export type TermPlanResult = { ok: true; message: string } | { ok: false; error: string };

export async function saveTermPlanAction(input: unknown): Promise<TermPlanResult> {
  const guard = await requireGuardianSession();
  if (!guard.ok) return guard;
  const state = guard.session;

  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the plan." };
  const plan = parsed.data;

  const names = plan.terms.map((term) => term.name.toLowerCase());
  if (new Set(names).size !== names.length) return { ok: false, error: "Two terms share a name." };

  const existing = await getTerms(state.householdId);
  const existingIds = new Set(existing.map((term) => term.id));
  if (plan.terms.some((term) => term.id && !existingIds.has(term.id))) {
    return { ok: false, error: "One of those terms is not in this household." };
  }
  if (!existingIds.has(plan.termId)) return { ok: false, error: "Pick a term to enrol subjects in." };

  // One route per subject, and only routes that exist.
  const options = await getRouteOptions();
  const subjectByRoute = new Map(options.flatMap((option) => option.routes.map((route) => [route.id, option.subjectCode])));
  const subjects = plan.enrollments.map((row) => subjectByRoute.get(row.routeId));
  if (subjects.some((code) => !code)) return { ok: false, error: "One of the chosen routes no longer exists." };
  if (new Set(subjects).size !== subjects.length) return { ok: false, error: "Choose one route per subject." };

  const savedTerms = await saveTerms(state.householdId, plan.terms);
  if (!savedTerms.ok) return savedTerms;

  const targetTerms = plan.applyToAllTerms ? (await getTerms(state.householdId)).map((term) => term.id) : [plan.termId];

  for (const termId of targetTerms) {
    const saved = await replaceEnrollments(state.learnerId, termId, plan.enrollments);
    if (!saved.ok) return { ok: false, error: `Terms saved, but subjects were not: ${saved.error}` };
  }

  for (const path of ["/parent/term-planner", "/parent", "/plan", "/today", "/subjects", "/parent/timetable"]) {
    revalidatePath(path);
  }

  return {
    ok: true,
    message: `Saved ${plan.terms.length} ${plan.terms.length === 1 ? "term" : "terms"} and ${plan.enrollments.length} ${
      plan.enrollments.length === 1 ? "subject" : "subjects"
    }${plan.applyToAllTerms ? " for every term" : ""}.`,
  };
}
