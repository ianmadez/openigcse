import { nextCard, ratingFor, retrievabilityAt, type RetentionCard } from "@/lib/retention/fsrs";
import { unique } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type RetentionItem = {
  objectiveId: string;
  mastery: number;
  dueAt: string | null;
  status: string;
  reps: number;
};

/** One objective the scheduler says is ready to be recalled. */
export type DueReview = {
  objectiveId: string;
  objectiveCode: string;
  subjectCode: string;
  subjectName: string;
  topicName: string;
  objectiveText: string;
  dueAt: string;
  lastReviewedAt: string | null;
  stability: number;
  /** Live retrievability at the moment the page was rendered. */
  retrievability: number;
  reps: number;
  lapses: number;
};

type CardRow = {
  stability: number;
  difficulty: number;
  due_at: string | null;
  last_reviewed_at: string | null;
  reps: number | null;
  lapses: number | null;
  scheduled_days: number | null;
  learning_steps: number | null;
  fsrs_state: number | null;
};

type PendingEvent = {
  event_id: string;
  objective_id: string;
  event_type: string;
  score_ratio: number;
  event_at: string;
};

/**
 * Derived FSRS state per objective: one row per (learner, objective), written only through
 * record_review(). Empty until Step 4.3 folds events in.
 */
export async function getRetention(learnerId: string): Promise<RetentionItem[]> {
  if (!learnerId) return [];

  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("fsrs_retention_items")
    .select("objective_id, composite_mastery, due_at, status, reps")
    .eq("student_id", learnerId);

  return (data ?? []).map((row) => ({
    objectiveId: row.objective_id,
    // composite_mastery is stored 0-100; the planner wants 0-1.
    mastery: Math.max(0, Math.min(1, (row.composite_mastery ?? 0) / 100)),
    dueAt: row.due_at,
    status: row.status ?? "New",
    reps: row.reps ?? 0,
  }));
}

function toCard(row: CardRow): RetentionCard {
  return {
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    dueAt: row.due_at ?? new Date(0).toISOString(),
    lastReviewedAt: row.last_reviewed_at,
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    scheduledDays: row.scheduled_days ?? 0,
    learningSteps: row.learning_steps ?? 0,
    state: row.fsrs_state ?? 0,
  };
}

/**
 * Folds scored events that have no review yet into the FSRS card, oldest first.
 *
 * This is what "update `fsrs_retention_items` on every recall, application and assessment event"
 * means in practice: the answer actions and the marking action call it, and every `/review` open
 * catches anything that slipped through (including events written before Step 4.3 existed). Each
 * event is claimed once by `fsrs_review_log`, so a repeat is harmless.
 */
export async function recordPendingReviews(
  learnerId: string,
  limit = 200,
): Promise<{ ok: true; recorded: number } | { ok: false; error: string; recorded: number }> {
  if (!learnerId) return { ok: true, recorded: 0 };

  const supabase = await createServerClientInstance();
  const { data, error } = await supabase.rpc("pending_review_events", { p_student: learnerId, p_limit: limit });
  if (error) return { ok: false, error: error.message, recorded: 0 };

  let recorded = 0;
  // The events are oldest first, so an objective usually repeats. Keep the card computed by the
  // previous write instead of re-reading it, and drop the entry if the event was already claimed.
  const cards = new Map<string, RetentionCard | null>();

  for (const event of (data ?? []) as PendingEvent[]) {
    let base = cards.get(event.objective_id);
    if (base === undefined) {
      const { data: stored } = await supabase
        .from("fsrs_retention_items")
        .select("stability, difficulty, due_at, last_reviewed_at, reps, lapses, scheduled_days, learning_steps, fsrs_state")
        .eq("student_id", learnerId)
        .eq("objective_id", event.objective_id)
        .maybeSingle<CardRow>();
      base = stored ? toCard(stored) : null;
    }

    const score = Number(event.score_ratio);
    const card = nextCard(base, { scoreRatio: score, at: new Date(event.event_at) });

    const { data: written, error: writeError } = await supabase.rpc("record_review", {
      p_event_id: event.event_id,
      p_rating: ratingFor(score),
      p_card: {
        stability: card.stability,
        difficulty: card.difficulty,
        dueAt: card.dueAt,
        retrievability: card.retrievability,
        status: card.status,
        state: card.state,
        scheduledDays: card.scheduledDays,
        learningSteps: card.learningSteps,
        reps: card.reps,
        lapses: card.lapses,
      },
    });

    if (writeError) return { ok: false, error: writeError.message, recorded };
    if ((written as Array<{ applied: boolean }> | null)?.[0]?.applied) {
      recorded += 1;
      cards.set(event.objective_id, card);
    } else {
      cards.delete(event.objective_id);
    }
  }

  return { ok: true, recorded };
}

/**
 * Objectives due now, most overdue first. Retrievability is computed at render time from the
 * stored stability, so the percentage is honest rather than the value captured when the card was
 * last written.
 */
export async function getDueReviews(
  learnerId: string,
  now: Date = new Date(),
): Promise<{ items: DueReview[]; pendingError: string | null }> {
  if (!learnerId) return { items: [], pendingError: null };

  const pending = await recordPendingReviews(learnerId, 50);
  const pendingError = pending.ok ? null : pending.error;

  const supabase = await createServerClientInstance();
  const { data: rows } = await supabase
    .from("fsrs_retention_items")
    .select("objective_id, stability, difficulty, due_at, last_reviewed_at, reps, lapses, scheduled_days, learning_steps, fsrs_state")
    .eq("student_id", learnerId)
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true })
    .limit(50);

  if (!rows?.length) return { items: [], pendingError };

  const cards = (rows as Array<CardRow & { objective_id: string }>).map((row) => ({ row, card: toCard(row) }));
  const objectiveIds = unique(cards.map((entry) => entry.row.objective_id));

  const { data: objectives } = await supabase
    .from("learning_objectives")
    .select("id, objective_code, summary_title, official_description, topic_id")
    .in("id", objectiveIds);
  const topicIds = unique((objectives ?? []).map((objective) => objective.topic_id));
  const { data: topics } = topicIds.length
    ? await supabase.from("topics").select("id, name, syllabus_version_id").in("id", topicIds)
    : { data: [] as { id: string; name: string; syllabus_version_id: string }[] };
  const versionIds = unique((topics ?? []).map((topic) => topic.syllabus_version_id));
  const { data: versions } = versionIds.length
    ? await supabase.from("syllabus_versions").select("id, subject_id").in("id", versionIds)
    : { data: [] as { id: string; subject_id: string }[] };
  const subjectIds = unique((versions ?? []).map((version) => version.subject_id));
  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, subject_code, subject_name").in("id", subjectIds)
    : { data: [] as { id: string; subject_code: string; subject_name: string }[] };

  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject]));
  const versionById = new Map((versions ?? []).map((version) => [version.id, version]));
  const topicById = new Map((topics ?? []).map((topic) => [topic.id, topic]));
  const objectiveById = new Map((objectives ?? []).map((objective) => [objective.id, objective]));

  const items = cards.flatMap<DueReview>(({ row, card }) => {
    const objective = objectiveById.get(row.objective_id);
    if (!objective) return [];
    const topic = topicById.get(objective.topic_id);
    const version = topic ? versionById.get(topic.syllabus_version_id) : undefined;
    const subject = version ? subjectById.get(version.subject_id) : undefined;

    return [
      {
        objectiveId: objective.id,
        objectiveCode: objective.objective_code,
        subjectCode: subject?.subject_code ?? "",
        subjectName: subject?.subject_name ?? "",
        topicName: topic?.name ?? "",
        objectiveText: objective.official_description || objective.summary_title,
        dueAt: card.dueAt,
        lastReviewedAt: card.lastReviewedAt,
        stability: card.stability,
        retrievability: retrievabilityAt(card, now),
        reps: card.reps,
        lapses: card.lapses,
      },
    ];
  });

  return { items, pendingError };
}
