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
- Task 1 (4.1): fixed. The `/today` period list called the parent's PIN-gated action, so the learner's Start and Finish could never save. It is replaced by `TodayPeriods`, which uses learner actions.
- Task 1: fixed. `todayIso()` used UTC, so for the hours between local midnight and UTC midnight (all morning in Asia/Kuala_Lumpur) `/today` built and showed the wrong day. It now takes the household timezone at every call site (test `dates.test.ts`, RED then GREEN).
- Task 1: Ruling: a learner may change only status, timing, order and a forward carry-over date. A trigger refuses edits to what was planned, and Done is reachable only through `finish_plan_item`, which writes the lesson event in the same transaction. Cost if wrong: a legitimate learner edit we did not foresee needs a trigger change.
- Task 1: Ruling: Finish logs the minutes between Start and Finish (1-600). The separate `StudyBlock` timer under "Study next" stays for unplanned study. Cost if wrong: a learner who never presses Start logs 1 minute.
- Task 1: complete. Evidence: verify:phase4 38/38 (10 new plan-item checks), test:unit 73/73, typecheck clean. Browser at 390px: reorder, Start, Finish (1 Exposure_Lesson), Skip "Too hard", all persisted after reload.

## Task 2 (Step 4.2): checkpoints, practice and trivia

- Finding: `trivia_questions_read` was `using (true)` and `trivia_modules` had no `household_id`, so any signed-in person could read every answer key for every family, and any guardian could edit another household's modules. Both tables are now household-scoped, learners read `learner_trivia_questions` (no `correct_letter`, no `explanation`), and only staff of the owning household can write.
- Ruling: trivia is household content, not a shared catalogue. Production held zero trivia rows when this landed, so scoping them lost nothing; a future shared library would be a second table, not a nullable `household_id`. Cost if wrong: null-household rows would be invisible rather than shared.
- Ruling: a trivia checkpoint writes `Active_Recall` with `objective_id = null`. Trivia is not syllabus content, so it counts towards time and streak but never towards mastery. Cost if wrong: attaching trivia to objectives later needs a column and an authoring control, not a rewrite.
- Ruling: the `/today` checkpoint's event type follows the task action. A practice task writes `Application_Question`; learn and review write `Active_Recall`. Cost if wrong: one classification choice, reversible in `checkpointKind()`.
- Ruling: the learner picks the notebook category, and a guardian can change it on the marking desk. The learner's pick is a first guess, not a claim about their work. Cost if wrong: a parent who disagrees must spend one click per entry.
- Finding: the `topic_area` check constraint limited every household to Science/History/Engineering/Nature. It is dropped; the column is free text and the form suggests areas already saved. Closes row 6 of the hard-coded register.
- Checkpoint mistakes keep `question_template_id`, so `/review` offers a correct retry instead of a written correction. Trivia mistakes have no question to retry and close by the parent-approved correction path.

## Task 3 (Step 4.3): spaced review with FSRS

- Finding: `ts-fsrs` 6.0.1 keeps the classic `fsrs()`, `next()` and `retrievability()` API but marks it deprecated in favour of a scheduler. The classic API is what the plan's pure `nextCard()` needs, so it is used and pinned to v6. Cost if wrong: a v7 upgrade rewrites one module, `src/lib/retention/fsrs.ts`.
- Ruling: `enable_fuzz: false`. A review must produce the same card every time it is replayed, otherwise the tests and the idempotency story both become fuzzy. Cost if wrong: due dates are on a fixed grid rather than spread out, which does not matter for one learner.
- Ruling: `fsrs_review_log` is the idempotency key, one row per learning event and no write policy for anyone but `record_review()`. Two devices answering the same checkpoint therefore advance the card once. Cost if wrong: two *different* events for the same objective processed at the same instant can read the same base card and the later write wins; the events are still both recorded, and only one schedule step is lost.
- Ruling: `learning_steps` is stored on the card. Without it, a second Good replays the 10-minute learning step instead of graduating to days; `fsrs.test.ts` pins the difference.
- Ruling: only `Active_Recall`, `Application_Question` and `Formal_Assessment` move the card, as the plan says. `Error_Correction` is a resolution signal, not a scheduling one. Cost if wrong: a correct retry does not reschedule by itself; one line in `pending_review_events` would change that.
- Ruling: trivia events have no objective and `record_review()` returns `applied = false` rather than raising. Cost if wrong: none; a trivia answer still counts as time and streak.
- Ruling: opening `/review` folds pending events before reading, so a GET can write. This matches `/today` building its plan on first open, and it is how the events written before 4.3 (and the `Formal_Assessment` rows a marking save writes) reach the card without a separate backfill job. Cost if wrong: a first render after a marking save does a handful of writes.
- Ruling: the due list computes retrievability at render time from the stored stability. The `retrievability` column records the value at the moment of review, which is not a useful number to display later.
- Ruling: the NBA "review due" input stays with Step 4.5, as the phase plan sets out. 4.3 exposes `getDueReviews()` and the card, so 4.5 only has to read them; wiring `rankActivities()` here would split the planner change across two steps.
- Blocked: `npx supabase db push --remote` was denied for `20261124000004_phase4_fsrs.sql` ("Remote DB migration lacks specific human authorization"). The dry run is clean and lists only that file. The 12 new `verify:phase4` checks and the browser check of `/review` therefore have not run; the last observed `verify:phase4` is the 52/52 from Step 4.2.

## Task 4 (Step 4.4): mastery and progress

- Ruling: mastery is 0.7 × the recency-weighted mean of scored events + 0.3 × FSRS retrievability, with Formal 1.0, Application 0.8 and Recall 0.6, exactly the constants agreed in the plan. Cost if wrong: every number on `/progress` shifts, and the fix is one function (`objective_mastery`) plus its twin.
- Ruling: `Error_Correction` carries no mastery weight, same as it carries no FSRS weight. A correction is a resolution signal. Cost if wrong: retrying a mistake right does not lift mastery until the next recall.
- Ruling: coverage counts any event with an objective, including a lesson, because the roadmap says "objectives with at least one event". Mastery still ignores lessons. Cost if wrong: an objective with only a lesson reads as covered and 0%, which is the honest reading.
- Finding: FSRS-6 retrievability floors elapsed time to whole days (`floor((now - last_review) / 1 day)`) before applying `(1 + factor·t/S)^decay`. The SQL function reproduces that, and `mastery.test.ts` pins the formula against ts-fsrs at 0.2 to 30 days. Cost of getting this wrong: SQL and TypeScript mastery would disagree by a few points on every partially elapsed day.
- Ruling: readiness is coverage × mean mastery of the covered objectives, 0-100, labelled "Not an official prediction" in both the panel status and the footer line. Cost if wrong: a family could over-trust a number that is only a household signal.
- Ruling: review compliance counts only reviews that had a previous due date. The first review of an objective had nothing to be late for. Cost if wrong: a learner who never reviews an objective is not penalised by this metric (intended).
- Finding: the 4.4 migration replaces `record_review()` to store `previous_due_at` and `on_time` on the log row rather than editing the 4.3 migration while it is being applied by hand. If both are pushed in order, the final function is the 4.4 one.
- Finding: `getTermAssessments()` now returns `student_score` so the assessment average is a real mean of marked papers, not a count.
- Blocked: both migrations were still unapplied when this step was written, so the 4.4 probes (`objective_mastery` against the TS twin, the forgetting curve, review compliance) have not run.

## Task 5 (Step 4.5): NBA on real inputs

- Ruling: the planner reads mastery from `objective_mastery()` rather than `fsrs_retention_items.composite_mastery` (always 0), so `/today` and `/progress` show one number. `masteryByObjective()` is deleted.
- Finding: the exit gate failed at the first try. A due review scored +15, so a just-missed objective (mastery 0.65, one open mistake) scored 46 against 65 for any never-studied objective, and on a full syllabus would never be planned. Ruling: a due review scores +50 plus overdue days (cap 7), so below the 70% target it always beats new material (0.3 x 55 + 50 > 65). Cost if wrong: reviews crowd out new topics; the fix is one constant.
- Ruling: last-studied falls back to `last_event_at` from the mastery read, so events older than the 28-day event window still count.
- The period packing is `allowanceFor()` (pure, tested): breaks ignore the cap, other periods take what is left of it, never negative.
- Exit gate observed in `verify:phase4` (74/74): lesson, right then wrong checkpoint on a fresh objective, mastery falls, FSRS due by tomorrow, tomorrow's ranking picks it.
- End-of-phase UI pass at 390/1280 on every Phase 4 screen; fixes listed in `docs/progress.md`.
