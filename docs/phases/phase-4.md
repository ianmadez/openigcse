# Phase 4 - The student learning loop

Merged to `main` on 2026-11-25 from branch `phase-4`.
Exit gate observed 2026-11-25 in `pnpm verify:phase4` on throwaway households: the learner finished a lesson and got a
checkpoint wrong; the objective's mastery dropped, an FSRS review fell due by tomorrow, and tomorrow's ranking picked
that objective.

## What it contains

| Step | Delivered |
| ---- | --------- |
| pre  | RLS tightening: answer keys hidden from learners, learner writes only through guarded functions and server actions. |
| 4.1  | `/today` built from `day_plan_items`; Start, Finish, Skip (with reason) and reorder write to Postgres. |
| 4.2  | Checkpoints scored on the server (`answer_checkpoint`, `answer_trivia_checkpoint`); "Add to my notebook"; `/parent/trivia` authoring. |
| 4.3  | FSRS with `ts-fsrs`; `record_review()` folds each event once; `/review` has Due and Notebook tabs. |
| 4.4  | `objective_mastery()` computed on read with a tested TS twin; student syllabus map; parent coverage, readiness, compliance. |
| 4.5  | Next-best-activity reads real mastery, FSRS due dates, open mistakes and assessment proximity. |

Migrations `20261124000001` to `20261124000005` (all applied to the linked project).
Checks: `pnpm test:unit` (118), `pnpm verify:phase4` (74/74, 0 leftovers), `pnpm test:rls` (22/22).

## Found on the way

- At +15 a due review could never beat a never-studied objective, so the gate failed; it now scores +50. See the ledger.
- End-of-phase UI pass at 390 px and 1280 px fixed "in 0 days" copy, an inflated topic count, "1 checkpoints", and the
  shared `Panel` header squeezing descriptions on phones.

## Carried forward

- Trivia checkpoints carry no objective, so they count for time and streak, not mastery.
- The Next.js dev indicator overlaps the header's top-right button in dev only; production is unaffected.
- Rulings and decisions: `docs/superpowers/plans/2026-11-24-phase4-ledger.md`.
