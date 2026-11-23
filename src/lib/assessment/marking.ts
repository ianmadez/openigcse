import { autoMarkMcq } from "@/lib/assessment/scoring";
import type { ErrorTag } from "@/lib/data/mistakes";

export type SheetMark = {
  awarded: number | null;
  feedback: string;
  errorCategory: ErrorTag | null;
  /** True when the mark came from the multiple-choice key rather than a person. */
  auto: boolean;
};

export const ERROR_TAGS: Array<{ value: ErrorTag; label: string; hint: string }> = [
  { value: "ConceptGap", label: "Concept gap", hint: "Did not know the idea" },
  { value: "CommandWordMisread", label: "Command word", hint: "Answered a different verb" },
  { value: "CalculationSlip", label: "Calculation", hint: "Right method, wrong arithmetic" },
  { value: "IncompleteExplanation", label: "Incomplete answer", hint: "Right idea, not enough detail" },
  { value: "TimePressure", label: "Time pressure", hint: "Ran out of time or left it blank" },
];

/**
 * The sheet a parent opens. Saved marks (and the reasons on their notebook
 * entries) win; otherwise multiple choice is marked from the key, and a wrong
 * choice starts tagged as a concept gap so it reaches the notebook unless the
 * parent picks a better reason. Written answers start unmarked.
 */
export function initialMarks(
  items: Array<{ questionId: string; kind: string; available: number; correctOption: string | null; selectedOption: string | null }>,
  saved: Map<string, { awarded: number; feedback: string | null }>,
  reasons: Map<string, ErrorTag>,
): Record<string, SheetMark> {
  return Object.fromEntries(
    items.map((item) => {
      const existing = saved.get(item.questionId);
      if (existing) {
        return [
          item.questionId,
          { awarded: existing.awarded, feedback: existing.feedback ?? "", errorCategory: reasons.get(item.questionId) ?? null, auto: false },
        ];
      }

      if (item.kind === "MCQ" && item.correctOption) {
        const awarded = autoMarkMcq(item.selectedOption, item.correctOption, item.available);
        return [
          item.questionId,
          { awarded, feedback: "", errorCategory: awarded < item.available ? "ConceptGap" : null, auto: true },
        ];
      }

      return [item.questionId, { awarded: null, feedback: "", errorCategory: null, auto: false }];
    }),
  );
}
