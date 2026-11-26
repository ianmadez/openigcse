/**
 * Objective lineage: how an old objective code maps to a new one, so a learner's
 * events and mastery can follow them when a package is regenerated or a new
 * syllabus edition replaces the old one.
 *
 * Proposals are made from wording only and always start unconfirmed. A parent
 * confirms them on the package review screen before any progress moves.
 */

export type LineageRow = {
  from_code: string;
  from_text: string;
  /** Null when nothing scored high enough; a reviewer decides. */
  to_code: string | null;
  /** "unchanged": same code and wording; "text-match": closest wording; "manual": set by a person. */
  method: "unchanged" | "text-match" | "manual";
  score: number;
  confirmed: boolean;
};

type ObjectiveLike = { objective_code: string; objective_text: string };

const FILLER = new Set(
  "a an and are as at be by for from in into is it its of on or that the their them this to with which how why what when where using use".split(
    " ",
  ),
);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !FILLER.has(word))
      .map((word) => word.replace(/(ies|es|s)$/, "")),
  );
}

/** Jaccard overlap of content words, 0..1. */
export function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Below this overlap a proposal is more likely wrong than useful, so the row has no target. */
export const MIN_SCORE = 0.25;

export function proposeLineage(from: ObjectiveLike[], to: ObjectiveLike[]): LineageRow[] {
  const rows: LineageRow[] = [];
  for (const old of from) {
    const same = to.find((candidate) => candidate.objective_code === old.objective_code);
    if (same && similarity(old.objective_text, same.objective_text) >= 0.9) {
      rows.push({
        from_code: old.objective_code,
        from_text: old.objective_text,
        to_code: same.objective_code,
        method: "unchanged",
        score: 1,
        confirmed: false,
      });
      continue;
    }
    let best: { code: string; score: number } | null = null;
    for (const candidate of to) {
      const score = similarity(old.objective_text, candidate.objective_text);
      if (!best || score > best.score) best = { code: candidate.objective_code, score };
    }
    if (best && best.score >= MIN_SCORE) {
      rows.push({
        from_code: old.objective_code,
        from_text: old.objective_text,
        to_code: best.code,
        method: "text-match",
        score: Math.round(best.score * 100) / 100,
        confirmed: false,
      });
    } else {
      rows.push({
        from_code: old.objective_code,
        from_text: old.objective_text,
        to_code: null,
        method: "text-match",
        score: 0,
        confirmed: false,
      });
    }
  }
  return rows;
}

/** Moves resources onto their lineage target; resources whose objective has no target are returned as dropped. */
export function remapResources<T extends { objective_code: string }>(
  resources: T[],
  lineage: LineageRow[],
  existing: Set<string>,
): { kept: T[]; dropped: T[] } {
  const target = new Map(lineage.flatMap((row) => (row.to_code ? [[row.from_code, row.to_code] as const] : [])));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const resource of resources) {
    const code = target.get(resource.objective_code);
    if (code && existing.has(code)) kept.push({ ...resource, objective_code: code });
    else dropped.push(resource);
  }
  return { kept, dropped };
}
