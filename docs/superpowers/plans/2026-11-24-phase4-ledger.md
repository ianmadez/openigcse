# Phase 4 ledger

Plan: `docs/superpowers/plans/2026-11-24-phase4-learning-loop.md`

## Decisions from Ian (2026-11-24)

- Mastery weights: Formal 1.0, Application 0.8, Recall 0.6, Lesson 0. Each event's weight halves every 30 days. Mastery = 0.7 × events + 0.3 × FSRS retrievability.
- Mistake resolve: a correct retry if a question exists; otherwise the learner writes a correction and the parent approves it.
- Readiness = coverage × mean mastery of the covered objectives, 0-100, with a "not an official prediction" label.
- Production migration push: dry run, then push.
- Hard-coded examples stay in place until the roadmap is at a confident state.

## Findings

- Task 0: `POST /api/learning-events` is unauthenticated and uses the service role. It writes to the first student row in the whole database. This is treated as Critical and fixed first.
