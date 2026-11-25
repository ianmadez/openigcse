import type { RetentionCard } from "./fsrs";

/**
 * Mastery maths (Step 4.4), mirroring `objective_mastery()` in
 * `supabase/migrations/20261124000005_phase4_mastery.sql`.
 *
 * Global constraints: Formal 1.0, Application 0.8, Recall 0.6; lessons add no score; every event's
 * weight halves every 30 days; mastery = 0.7 × events + 0.3 × FSRS retrievability.
 */

export const MASTERY_WEIGHTS = {
  Active_Recall: 0.6,
  Application_Question: 0.8,
  Formal_Assessment: 1,
} as const;

export type ScoredEventType = keyof typeof MASTERY_WEIGHTS;

export type ScoredEvent = {
  eventType: string;
  scoreRatio: number;
  at: string;
};

const HALF_LIFE_DAYS = 30;
const DAY_MS = 86_400_000;

/** FSRS-6 forgetting curve constants, the values ts-fsrs uses by default. */
const DECAY = -0.1542;
const FACTOR = 0.9803464944134799;

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function recencyWeight(at: string, now: Date) {
  const days = Math.max(0, (now.getTime() - new Date(at).getTime()) / DAY_MS);
  return 0.5 ** (days / HALF_LIFE_DAYS);
}

/** Recency-weighted mean of scored events. Lessons and corrections carry no weight. */
export function eventMasteryOf(events: ScoredEvent[], now: Date): number {
  let weightedScore = 0;
  let weight = 0;

  for (const event of events) {
    const typeWeight = MASTERY_WEIGHTS[event.eventType as ScoredEventType];
    if (!typeWeight) continue;
    const recency = recencyWeight(event.at, now);
    weightedScore += typeWeight * clamp01(event.scoreRatio) * recency;
    weight += typeWeight * recency;
  }

  return weight > 0 ? weightedScore / weight : 0;
}

export function blendMastery(eventMastery: number, retrievability: number) {
  return 0.7 * clamp01(eventMastery) + 0.3 * clamp01(retrievability);
}

export function objectiveMasteryOf(events: ScoredEvent[], retrievability: number, now: Date) {
  const eventMastery = eventMasteryOf(events, now);
  return { eventMastery, mastery: blendMastery(eventMastery, retrievability) };
}

/** Readiness = coverage × mean mastery of the covered objectives, as a 0-1 ratio. */
export function readinessOf(covered: number, total: number, meanMastery: number) {
  const coverage = total > 0 ? Math.min(1, Math.max(0, covered / total)) : 0;
  return { coverage, readiness: coverage * clamp01(meanMastery) };
}

/**
 * Retrievability from the stored card, matching `fsrs_retrievability()` in SQL: elapsed time is
 * floored to whole days, exactly as ts-fsrs does.
 */
export function retrievabilityOf(
  card: Pick<RetentionCard, "stability" | "lastReviewedAt">,
  now: Date,
): number {
  if (!card.lastReviewedAt || card.stability <= 0) return 0;
  const elapsedDays = Math.floor(Math.max(0, now.getTime() - new Date(card.lastReviewedAt).getTime()) / DAY_MS);
  return clamp01((1 + (FACTOR * elapsedDays) / card.stability) ** DECAY);
}
