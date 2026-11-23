/** How the learner can close a mistake (Phase 4, Step 4.3). */
export type ResolveMode = "done" | "retry" | "correction" | "waiting";

export function resolveMode(mistake: {
  status: "open" | "resolved";
  questionType: string | null;
  hasOptions: boolean;
  correctionSubmitted: boolean;
}): ResolveMode {
  if (mistake.status === "resolved") return "done";
  if (mistake.questionType === "MCQ" && mistake.hasOptions) return "retry";
  return mistake.correctionSubmitted ? "waiting" : "correction";
}

export function checkpointMessage(result: { correct: boolean; correctOption: string | null }) {
  if (result.correct) return "Correct.";
  return result.correctOption ? `Not quite. The answer is ${result.correctOption}.` : "Not quite.";
}
