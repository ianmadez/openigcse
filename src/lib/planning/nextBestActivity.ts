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
  /** Whole days the FSRS card is past due (0 = due today); null when no card is due. */
  reviewOverdueDays: number | null;
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
      signal.daysUntilAssessment <= 0
        ? `${label} is due`
        : signal.daysUntilAssessment === 1
          ? `${label} tomorrow`
          : `${label} in ${signal.daysUntilAssessment} days`,
    );
  }

  if (signal.reviewOverdueDays !== null) {
    reasons.push(
      signal.reviewOverdueDays === 0
        ? "Review due today"
        : `Review overdue by ${signal.reviewOverdueDays} ${signal.reviewOverdueDays === 1 ? "day" : "days"}`,
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

export function scoreOf(signal: ActivitySignal): number {
  const gap = Math.max(0, 1 - signal.mastery);
  let score = gap * 55;

  score += Math.min(signal.openMistakes, 3) * 12;

  if (signal.daysUntilAssessment !== null && signal.daysUntilAssessment <= 14) {
    const proximity = 1 - Math.max(0, signal.daysUntilAssessment) / 14;
    score += 10 + proximity * 30;
  }

  // A due FSRS card means something already learned is slipping. Below the
  // mastery target it must outrank a never-studied objective (55 + 10 = 65),
  // or a fresh syllabus would bury every review: 0.3 gap x 55 + 50 > 65.
  // Overdue days add a little, capped at a week.
  if (signal.reviewOverdueDays !== null) score += 50 + Math.min(Math.max(0, signal.reviewOverdueDays), 7);

  if (signal.lastStudiedDaysAgo === null) score += 10;
  else if (signal.lastStudiedDaysAgo >= 14) score += 8;
  else if (signal.lastStudiedDaysAgo >= 7) score += 4;

  if (signal.mastery >= 0.9) score *= 0.35;
  if (!signal.hasLesson) score -= 15;

  return Math.round(score * 10) / 10;
}

function actionFor(signal: ActivitySignal): PlannedTask["action"] {
  if (signal.openMistakes > 0 || signal.reviewOverdueDays !== null) return "review";
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

/**
 * How many minutes a period can give to study. A break never counts against
 * the day's cap; anything else takes what is left of the cap, never more than
 * the period itself and never less than zero.
 */
export function allowanceFor(periodMinutes: number, isBreak: boolean, cap: number | null, plannedSoFar: number) {
  if (periodMinutes <= 0) return 0;
  if (isBreak || cap === null) return periodMinutes;
  return Math.min(periodMinutes, Math.max(0, cap - plannedSoFar));
}
