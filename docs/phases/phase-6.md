# Phase 6: Curriculum extraction and all ten packages

Branch `phase-6`, 2026-11-26. Plan and rulings: `docs/superpowers/plans/2026-11-26-phase6-*.md`.

## What it did

- **6.1 Parser.** One reader per layout family (decimal, science, maths, cs, history, skills) over a shared section
  finder; `content_layout` in the registry picks it. All ten PDFs parse with no warnings: 0455 113 objectives, 0460 129,
  0470 164, 0478 96, 0500 18, 0530 26, 0580 252, 0610 389, 0620 252, 0625 324.
- **6.2 Assessment side.** Papers (duration, marks, weighting, tier, private eligibility), per-tier private entry routes
  (`PRIVATE-CORE`, `PRIVATE`), assessment objectives with weightings, and the command-word glossary (`command_words`
  table). Every subject now has at least one entry route.
- **6.3 Review.** `/parent/curriculum` lists packages; each review page shows the PDF page beside the objectives, edits
  wording inline, records progress-link decisions and marks the package verified (refused while links are undecided).
  Edits write the package files on a local checkout; a hosted build is read-only. Ingest writes `verified: false`
  and refuses to overwrite a verified package without `--force`.
- **6.4 Lineage.** Replaced objectives are retired (renamed aside, `retired_at` set) instead of overwritten, confirmed
  links go into `objective_lineage`, and `carry_over_objective_progress()` moves one household's progress when the
  guardian presses "Move progress".

## Database

Migrations `20261126000001` (command_words) and `20261126000002` (lineage, retired_at, carry-over function) applied with
real row counts unchanged. All ten packages imported with `--allow-draft` at the user's request (2026-11-26): ten
subjects with routes, AOs and command words; the 75 draft objectives are retired.

## Checks

`pnpm test:parser` 37/37, `pnpm test:unit` 162/162, `pnpm validate` 10/10, `pnpm verify:phase6` 17/17, `test:rls`
22/22, phase 3/4/5 probes 34/74/48. Phase 5's break check compared a database time with this machine's clock (3.3 s
skew); it now asks the database. `pnpm build` clean.

## Carried forward

- **Exit gate observed 2026-11-26:** `pnpm validate --gate` passes for all ten after a spot-check verification (ledger
  ruling 13); the verified packages were re-imported. Use `pnpm run import` (`pnpm import` is pnpm's own command).
- The household's one lesson on a retired objective moves when a guardian presses "Move progress" on
  `/parent/curriculum`.
- Terms, enrolment and term planning are left to the household; user guides come after Phase 9.
- The browser walk of the new screens at 390/1280 px did not finish (the run timed out loading the list on a cold
  dev server); repeat it before Phase 7.
- Maths notation from the PDF text layer needs hand fixes on review. Spanish topic areas are not extracted.
