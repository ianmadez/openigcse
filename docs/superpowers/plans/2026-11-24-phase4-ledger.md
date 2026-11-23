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
- Task 0: PATCH `/api/mistakes` was also unauthenticated (anyone could resolve or reopen any mistake by id). Both routes deleted.
- Task 0: Ruling: an earlier claim that guardians could cross households was wrong; Phase 0 had already scoped those policies through a dynamic block. The real gap was learners writing any column of their own rows. Cost if wrong: none, because the new policies are stricter either way.
- Task 0: Ruling: answer keys live inside `options_schema` (a `correct` flag on each option), so hiding columns cannot work. Learners read a `security_barrier` view instead, and questions on a paper stay hidden until that paper is started. Cost if wrong: a checkpoint question reused on a paper disappears from `/today` until the paper is sat.
- Task 0: Ruling: learners may insert only unscored events. Every score is computed in Postgres (`answer_checkpoint`, `resolve_mistake`, `save_assessment_marks`). Cost if wrong: future learner-scored activity types each need a function.
- Task 0: fixed. StudyTimer said "Saved on this device" and StuckButton said "Asked" even when the write failed, which breaks ground rule 5. Both now show the error and keep the input for a retry.
- Task 0: complete. Evidence: verify:phase4 28/28, verify:phase3 34/34, test:rls 22/22, test:unit 66/66, typecheck clean. Browser (390px): retry wrong → open, retry right → resolved, correction → parent accepts → resolved after reload. The sitting screen ships no `correct` flag or rubric.
- Added outside the plan, at Ian's request: a simple main menu at `/`. Guardians land on it after sign-in.
