/**
 * Pure marking arithmetic, shared by the marking desk (to show totals and
 * catch mistakes before saving) and the assessment builder. The database
 * function save_assessment_marks enforces the same rules again on write.
 */
import type { ErrorTag } from "@/lib/data/mistakes";

export type MarkInput = {
  questionId: string;
  available: number;
  awarded: number | null;
  errorCategory: ErrorTag | null;
};

export type GradeThreshold = { grade: string; minPercent: number };

/** Multiple choice is all or nothing. */
export function autoMarkMcq(selected: string | null, correct: string, marks: number): number {
  return selected !== null && selected === correct ? marks : 0;
}

export function validateMarks(
  items: MarkInput[],
): { ok: true } | { ok: false; error: string; questionId: string } {
  for (const item of items) {
    const { awarded, available, questionId } = item;

    if (awarded === null || Number.isNaN(awarded)) {
      return { ok: false, error: "Every question needs a mark before saving.", questionId };
    }
    if (!Number.isInteger(awarded) || awarded < 0 || awarded > available) {
      return { ok: false, error: `A mark must be a whole number from 0 to ${available}.`, questionId };
    }
    if (awarded < available && !item.errorCategory) {
      return { ok: false, error: "Every dropped mark needs a reason.", questionId };
    }
  }

  return { ok: true };
}

/** Score ratio per objective, pooling every item tagged to it. */
export function objectiveRatios(
  items: Array<{ objectiveId: string | null; available: number; awarded: number }>,
): Map<string, number> {
  const totals = new Map<string, { available: number; awarded: number }>();

  for (const item of items) {
    if (!item.objectiveId) continue;
    const total = totals.get(item.objectiveId) ?? { available: 0, awarded: 0 };
    total.available += item.available;
    total.awarded += item.awarded;
    totals.set(item.objectiveId, total);
  }

  const ratios = new Map<string, number>();
  for (const [objectiveId, total] of totals) {
    if (total.available > 0) ratios.set(objectiveId, total.awarded / total.available);
  }
  return ratios;
}

/** The highest grade whose threshold the percentage meets, from thresholds the parent typed in. */
export function estimateGrade(percent: number, thresholds: GradeThreshold[]): string | null {
  const met = thresholds
    .filter((threshold) => percent >= threshold.minPercent)
    .sort((left, right) => right.minPercent - left.minPercent);

  return met[0]?.grade ?? null;
}

/**
 * Question ids on the learner's weakest objectives. An objective with no
 * evidence yet counts as weaker than any measured one; ties keep input order.
 */
export function pickWeakest(
  candidates: Array<{ id: string; objectiveId: string | null }>,
  ratioByObjective: Map<string, number>,
  n: number,
): string[] {
  const strength = (objectiveId: string | null) =>
    objectiveId && ratioByObjective.has(objectiveId) ? ratioByObjective.get(objectiveId)! : -1;

  return candidates
    .map((candidate, index) => ({ candidate, index, strength: strength(candidate.objectiveId) }))
    .sort((left, right) => left.strength - right.strength || left.index - right.index)
    .slice(0, Math.max(0, n))
    .map(({ candidate }) => candidate.id);
}
