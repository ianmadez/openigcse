/**
 * Next best activity.
 *
 * Ranks objectives by how much attention they need and returns a plain-English
 * reason for every position, so the learner can disagree with the order. Pure
 * function: no clock reads, no randomness, no I/O.
 */

export type ActivitySignal = {
  objectiveCode: string;
  subjectCode: string;
  subjectName: string;
  topicName: string;
  objectiveText: string;
  commandWord: string;
  tier: string;
  minutes: number;
  mastery: number;
  openMistakes: number;
  lastStudiedDaysAgo: number | null;
  daysUntilAssessment: number | null;
  assessmentTitle: string | null;
  hasLesson: boolean;
};

export type PlannedTask = ActivitySignal & {
  score: number;
  reasons: string[];
  action: "review" | "learn" | "practice";
};

const MASTERY_TARGET = 0.7;

function reasonsFor(signal: ActivitySignal): string[] {
  const reasons: string[] = [];

  if (signal.daysUntilAssessment !== null && signal.daysUntilAssessment <= 14) {
    const label = signal.assessmentTitle ?? "Assessment";
    reasons.push(
      signal.daysUntilAssessment <= 0 ? `${label} is due` : `${label} in ${signal.daysUntilAssessment} days`,
    );
  }

  if (signal.openMistakes > 0) {
    reasons.push(`${signal.openMistakes} open ${signal.openMistakes === 1 ? "mistake" : "mistakes"} in the notebook`);
  }

  if (signal.openMistakes === 0 && signal.mastery < MASTERY_TARGET) {
    reasons.push(`Mastery at ${Math.round(signal.mastery * 100)}%, target is ${Math.round(MASTERY_TARGET * 100)}%`);
  }

  if (signal.lastStudiedDaysAgo === null) {
    reasons.push("Never studied");
  } else if (signal.lastStudiedDaysAgo >= 7) {
    reasons.push(`Last studied ${signal.lastStudiedDaysAgo} days ago`);
  }

  if (reasons.length === 0) {
    reasons.push("Keeps a secure topic warm");
  }

  return reasons;
}

function scoreOf(signal: ActivitySignal): number {
  const gap = Math.max(0, 1 - signal.mastery);
  let score = gap * 55;

  score += Math.min(signal.openMistakes, 3) * 12;

  if (signal.daysUntilAssessment !== null && signal.daysUntilAssessment <= 14) {
    const proximity = 1 - Math.max(0, signal.daysUntilAssessment) / 14;
    score += 10 + proximity * 30;
  }

  if (signal.lastStudiedDaysAgo === null) score += 10;
  else if (signal.lastStudiedDaysAgo >= 14) score += 8;
  else if (signal.lastStudiedDaysAgo >= 7) score += 4;

  if (signal.mastery >= 0.9) score *= 0.35;
  if (!signal.hasLesson) score -= 15;

  return Math.round(score * 10) / 10;
}

function actionFor(signal: ActivitySignal): PlannedTask["action"] {
  if (signal.openMistakes > 0) return "review";
  if (signal.mastery < 0.4) return "learn";
  return "practice";
}

export function rankActivities(signals: ActivitySignal[], limit = 3): PlannedTask[] {
  return [...signals]
    .map((signal) => ({
      ...signal,
      score: scoreOf(signal),
      reasons: reasonsFor(signal),
      action: actionFor(signal),
    }))
    .sort((a, b) => b.score - a.score || a.objectiveCode.localeCompare(b.objectiveCode))
    .slice(0, limit);
}

export function totalMinutes(tasks: PlannedTask[]) {
  return tasks.reduce((sum, task) => sum + task.minutes, 0);
}
