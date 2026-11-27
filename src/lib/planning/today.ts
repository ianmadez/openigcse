/** Pure helpers for the learner's day on /today (Phase 4, Step 4.1). */

export const SKIP_REASONS = [
  { value: "too-hard", label: "Too hard" },
  { value: "no-time", label: "No time" },
  { value: "already-know", label: "Already know it" },
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number]["value"];

type Ordered = { id: string; slotId: string | null; sequence: number };

/** Groups plan items by period (slot), periods in first-seen order, items by sequence. */
export function groupByPeriod<T extends Ordered>(items: T[]) {
  const groups: Array<{ slotId: string | null; items: T[] }> = [];
  for (const entry of items) {
    let group = groups.find((candidate) => candidate.slotId === entry.slotId);
    if (!group) {
      group = { slotId: entry.slotId, items: [] };
      groups.push(group);
    }
    group.items.push(entry);
  }
  for (const group of groups) group.items.sort((a, b) => a.sequence - b.sequence);
  return groups;
}

/**
 * Moves one item up (-1) or down (+1) inside its period. The period keeps the sequence numbers it
 * already had, so other periods are untouched. Returns only the items whose sequence changed, or
 * null when nothing moves.
 */
export function reorderWithin(period: Ordered[], id: string, direction: -1 | 1) {
  const ordered = [...period].sort((a, b) => a.sequence - b.sequence);
  const from = ordered.findIndex((entry) => entry.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return null;

  const sequences = ordered.map((entry) => entry.sequence);
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved!);
  return ordered
    .map((entry, index) => ({ id: entry.id, sequence: sequences[index]! }))
    .filter((move) => period.find((entry) => entry.id === move.id)?.sequence !== move.sequence);
}

/** Minutes between Start and Finish: at least 1, at most 600 (the event limit). */
export function elapsedMinutes(startedAt: string | null, now: Date) {
  if (!startedAt) return 1;
  const minutes = Math.round((now.getTime() - new Date(startedAt).getTime()) / 60000);
  return Math.min(600, Math.max(1, minutes));
}

/** A replayed start keeps the learner's time if it is within the last 12 hours and not ahead of now. */
export function startTimeFor(claimed: string | undefined, now: Date) {
  const at = claimed ? Date.parse(claimed) : Number.NaN;
  if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > 12 * 3_600_000) return now.toISOString();
  return new Date(at).toISOString();
}
