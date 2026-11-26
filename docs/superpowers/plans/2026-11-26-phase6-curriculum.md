# Phase 6 plan: curriculum extraction and all ten packages

Roadmap Phase 6. Exit gate: `pnpm validate` passes for ten packages with `verified: true`, each with at least one entry
route.

## Baseline (2026-11-26, before any change)

`pnpm ingest --dry-run` on the ten PDFs in `raw-syllabuses/`: 0455 no topics; 0460, 0470, 0478, 0500, 0530, 0580
heading miss; 0610 65 topics / 0 objectives; 0620 52 / 1; 0625 41 / 19. This matches the roadmap's list.

## Steps

- **6.1 Parser against the real PDFs.** One reader per layout family (`decimal`, `science`, `maths`, `cs`, `history`,
  `skills`) over a shared section finder ("N Subject content" at 18pt to the next numbered 18pt section). The family is
  configuration in the registry (`content_layout`). Tests: a synthetic case per family plus pinned counts for each real
  PDF (skipped when the PDF is absent). Ingest stops writing `verified: true`.
- **6.2 Assessment side.** Components, durations, marks, weightings and entry routes from "Assessment overview";
  command-word glossary per syllabus into a `command_words` table (migration with RLS).
- **6.3 Human review.** Parent package review screen (PDF page beside extracted objectives, inline edit, mark
  verified). Import refuses unverified packages without `--allow-draft`. Generate 0620, 0460, 0470, 0455, 0530;
  regenerate the five drafts.
- **6.4 Version lineage.** `objective_lineage` table mapping old to new objective codes so events and mastery carry
  over.

- **6.5 Editions follow the exam year (added 2026-11-26).** The learner is in Form 2 / Year 8. The registry allows
  several editions per subject; the importer and enrolment pick the edition covering the learner's
  `target_exam_series`. Moving to Year 9 means changing the profile and adding editions, not editing code. Flags a
  subject whose editions do not cover the target year.

## Checks

`pnpm typecheck; pnpm test:unit; pnpm test:parser; pnpm validate; pnpm test:rls; pnpm build; pnpm check:contrast`,
plus a Phase 6 DB probe once 6.2 adds a table.
