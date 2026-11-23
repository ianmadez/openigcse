import type { GradeThreshold } from "@/lib/assessment/scoring";

/** Database categories with the names a parent uses. */
export const ASSESSMENT_KINDS = [
  { value: "WeeklyQuiz", label: "Weekly quiz" },
  { value: "TopicTest", label: "Topic test" },
  { value: "MidTermExam", label: "Mid-term" },
  { value: "FinalTermExam", label: "Final" },
  { value: "TimedPastPaper", label: "Past paper" },
] as const;

export type AssessmentCategory = (typeof ASSESSMENT_KINDS)[number]["value"];

export const KIND_NAME: Record<string, string> = Object.fromEntries(ASSESSMENT_KINDS.map((kind) => [kind.value, kind.label]));

export function parseThresholds(
  rows: Array<{ grade: string; minPercent: number | null }>,
): { ok: true; thresholds: GradeThreshold[] } | { ok: false; error: string } {
  const thresholds: GradeThreshold[] = [];

  for (const row of rows) {
    const grade = row.grade.trim();
    if (!grade && row.minPercent === null) continue;
    if (!grade) return { ok: false, error: "Every threshold needs a grade." };
    if (row.minPercent === null || Number.isNaN(row.minPercent)) {
      return { ok: false, error: `Give grade ${grade} a minimum percentage.` };
    }
    if (row.minPercent < 0 || row.minPercent > 100) return { ok: false, error: "Percentages run from 0 to 100." };
    thresholds.push({ grade, minPercent: row.minPercent });
  }

  if (new Set(thresholds.map((row) => row.grade.toUpperCase())).size !== thresholds.length) {
    return { ok: false, error: "A grade is listed twice." };
  }
  if (new Set(thresholds.map((row) => row.minPercent)).size !== thresholds.length) {
    return { ok: false, error: "Two grades share the same percentage." };
  }

  return { ok: true, thresholds: thresholds.sort((left, right) => right.minPercent - left.minPercent) };
}

export type SittingState = "draft" | "scheduled" | "in_progress" | "handed_in" | "marked";

export const STATE_LABEL: Record<SittingState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  in_progress: "Being sat",
  handed_in: "To mark",
  marked: "Marked",
};

/**
 * Where an assessment stands for one learner. A sitting whose time ran out
 * counts as handed in even if the tab closed before the automatic submit, so
 * it still reaches the marking queue.
 */
export function sittingState(
  input: {
    status: string;
    durationMinutes: number;
    sitting: { startedAt: string; submittedAt: string | null } | null;
  },
  now: Date = new Date(),
): SittingState {
  if (input.status === "Marked") return "marked";
  if (input.status === "Draft") return "draft";
  if (!input.sitting) return "scheduled";
  if (input.sitting.submittedAt) return "handed_in";

  const endsAt = Date.parse(input.sitting.startedAt) + input.durationMinutes * 60_000;
  return now.getTime() >= endsAt ? "handed_in" : "in_progress";
}

/**
 * A question on a paper that has been sat or marked is part of the record:
 * changing its objective, key or marks would rewrite what was marked.
 */
export function questionEditBlock(states: SittingState[]): string | null {
  return states.some((state) => state === "in_progress" || state === "handed_in" || state === "marked")
    ? "This question is on a paper that has been sat or marked, so it can no longer change. Copy it into a new question instead."
    : null;
}
