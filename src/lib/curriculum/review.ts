/**
 * Step 6.3: the edits a reviewer can make to an extracted package. Pure functions
 * over the package's JSON so they can be tested without a file system.
 */
import { commandWordOf, type LearningObjective, type LineageEntry, type Manifest } from "./schemas";

export type ReviewResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Replaces one objective's wording; the command word is re-read from the new text. */
export function editObjective(
  objectives: LearningObjective[],
  code: string,
  text: string,
): ReviewResult<LearningObjective[]> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 8) return { ok: false, error: "An objective needs at least 8 characters." };
  const index = objectives.findIndex((objective) => objective.objective_code === code);
  if (index === -1) return { ok: false, error: `No objective ${code} in this package.` };
  const next = [...objectives];
  next[index] = { ...next[index]!, objective_text: clean, command_word: commandWordOf(clean) };
  return { ok: true, value: next };
}

/** Confirms or retargets one lineage row. A null target records that nothing carries over. */
export function decideLineage(
  lineage: LineageEntry[],
  objectives: LearningObjective[],
  fromCode: string,
  toCode: string | null,
): ReviewResult<LineageEntry[]> {
  const index = lineage.findIndex((row) => row.from_code === fromCode);
  if (toCode !== null && !objectives.some((objective) => objective.objective_code === toCode)) {
    return { ok: false, error: `No objective ${toCode} in this package.` };
  }
  const existing = index === -1 ? null : lineage[index]!;
  const row: LineageEntry = {
    from_code: fromCode,
    from_text: existing?.from_text ?? "",
    to_code: toCode,
    method: existing && existing.to_code === toCode && toCode !== null ? existing.method : "manual",
    score: toCode === null ? 0 : existing && existing.to_code === toCode ? existing.score : 1,
    confirmed: true,
  };
  const next = [...lineage];
  if (index === -1) next.push(row);
  else next[index] = row;
  return { ok: true, value: next };
}

/**
 * Marks a package verified. Refuses while lineage proposals are still unconfirmed,
 * because importing would otherwise move progress along a guess.
 */
export function verifyManifest(
  manifest: Manifest,
  lineage: LineageEntry[],
  reviewer: string,
  now: Date,
): ReviewResult<Manifest> {
  const open = lineage.filter((row) => !row.confirmed).length;
  if (open > 0) {
    return {
      ok: false,
      error: `Confirm or remove the ${open} unconfirmed objective link${open === 1 ? "" : "s"} first.`,
    };
  }
  return {
    ok: true,
    value: {
      ...manifest,
      provenance: { ...manifest.provenance, verified: true, reviewed_by: reviewer, reviewed_at: now.toISOString() },
    },
  };
}
