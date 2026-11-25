import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";

/**
 * Spaced review (Step 4.3). The scheduling maths is ts-fsrs; this module only translates between
 * the database's flat columns and a card, and maps `score_ratio` onto a rating.
 *
 * Fuzz is off so the same event always produces the same card, which is what the tests and the
 * idempotent `record_review()` rely on.
 */

export type RetentionStatus = "New" | "Learning" | "Review" | "Mastered";

export type RetentionCard = {
  stability: number;
  difficulty: number;
  dueAt: string;
  lastReviewedAt: string | null;
  reps: number;
  lapses: number;
  scheduledDays: number;
  /** ts-fsrs learning step index, carried through so a learning card graduates on time. */
  learningSteps: number;
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
};

export type ScheduledCard = RetentionCard & {
  status: RetentionStatus;
  retrievability: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

/** Below 0.5 Again, below 0.7 Hard, below 0.9 Good, otherwise Easy. */
export function ratingFor(scoreRatio: number): Grade {
  const score = Number.isFinite(scoreRatio) ? Math.max(0, Math.min(1, scoreRatio)) : 0;
  if (score < 0.5) return Rating.Again;
  if (score < 0.7) return Rating.Hard;
  if (score < 0.9) return Rating.Good;
  return Rating.Easy;
}

/** The database has four statuses, FSRS has four states; Relearning reads as Learning here. */
export function statusFor(state: number): RetentionStatus {
  if (state === State.New) return "New";
  if (state === State.Review) return "Review";
  return "Learning";
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toFsrsCard(card: RetentionCard): Card {
  return {
    due: new Date(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.lastReviewedAt ? new Date(card.lastReviewedAt) : undefined,
  };
}

/**
 * Folds one scored event into the card. A null card means this objective has never been reviewed,
 * so the event is the first one and FSRS starts from an empty card at the event's timestamp.
 */
export function nextCard(
  card: RetentionCard | null,
  review: { scoreRatio: number; at: Date },
): ScheduledCard {
  const base = card ? toFsrsCard(card) : createEmptyCard(review.at);
  const scheduled = scheduler.next(base, review.at, ratingFor(review.scoreRatio)).card;
  const retrievability = scheduler.retrievability(scheduled, review.at);

  return {
    stability: round(scheduled.stability, 4),
    difficulty: round(scheduled.difficulty, 2),
    dueAt: scheduled.due.toISOString(),
    lastReviewedAt: (scheduled.last_review ?? review.at).toISOString(),
    reps: scheduled.reps,
    lapses: scheduled.lapses,
    scheduledDays: scheduled.scheduled_days,
    learningSteps: scheduled.learning_steps,
    state: scheduled.state,
    status: statusFor(scheduled.state),
    retrievability: round(Number.isFinite(retrievability) ? Math.min(1, Math.max(0, retrievability)) : 0, 4),
  };
}

/** How much of the card is still recalled at `now`; zero for a card that has never been reviewed. */
export function retrievabilityAt(card: RetentionCard, now: Date): number {
  if (!card.lastReviewedAt || card.stability <= 0) return 0;
  const value = scheduler.retrievability(toFsrsCard(card), now);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function isDue(card: Pick<RetentionCard, "dueAt">, now: Date): boolean {
  return new Date(card.dueAt).getTime() <= now.getTime();
}

/** A short, timezone-free label: the list is ordered by exact timestamps. */
export function dueLabel(dueAt: string, now: Date): string {
  const difference = new Date(dueAt).getTime() - now.getTime();
  if (difference <= 0) {
    const days = Math.floor(-difference / DAY_MS);
    if (days === 0) return "Due now";
    return `Overdue by ${days} ${days === 1 ? "day" : "days"}`;
  }
  const days = Math.ceil(difference / DAY_MS);
  return days <= 1 ? "Due within a day" : `Due in ${days} days`;
}
