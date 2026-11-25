# Phase 4 - The Student Learning Loop: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` tracking.

**Goal:** everything the student does writes a learning event, and those events drive mastery, FSRS review and
tomorrow's plan.

**Architecture:**
- **Learner writes** go through server actions guarded by `requireLearnerSession()`. RLS lets a learner insert only their own rows, with no update or delete.
- **FSRS state** is computed by `ts-fsrs` in a pure module and persisted in `fsrs_retention_items`.
- **Mastery** is a SQL function over `learning_events` plus FSRS retrievability. Nothing stores mastery itself.

**Tech stack:** Next.js 15, Supabase, `ts-fsrs`, `node:test`.

**Spec:** `OpenIGCSE V1 Roadmap.pdf`, Phase 4 (Steps 4.1-4.5). Answers to the open questions are recorded in the
ledger (2026-11-24).

## Global Constraints

- **Event types:** `Exposure_Lesson`, `Active_Recall`, `Application_Question`, `Formal_Assessment` and `Error_Correction`. `score_ratio` is between 0 and 1.
- **FSRS rating from `score_ratio`:** below 0.5 is Again, below 0.7 is Hard, below 0.9 is Good, otherwise Easy.
- **Mastery weights:** Formal 1.0, Application 0.8, Recall 0.6. Lessons add no score.
- **Recency:** each event's weight halves every 30 days.
- **Final mastery:** 0.7 × events + 0.3 × FSRS retrievability.
- **Readiness** (per subject) = coverage × mean mastery of covered objectives, shown 0-100 with the label "not an official prediction".
- **Resolving a mistake:** a correct retry (`Error_Correction`) when a question exists. When none exists, the learner writes a correction and the parent approves it.
- Hard-coded examples (`DEMO_MODE` and the faculty colour copies) stay in place this phase (`docs/source-of-truth/unhardcoding.md`).
- Production DB: dry run, then push. Real household row counts must match before and after.

## Review Focus

1. Two devices answering the same checkpoint must not produce a double FSRS update.
2. An event with no `objective_id` (a lesson on an unmapped resource) must not crash mastery.
3. Day boundaries come from the household timezone, not UTC, for "tomorrow's plan" and "due".
4. A learner token cannot read answer keys, nor write another learner's rows, over REST.
5. A learner with an empty database sees empty states on `/progress` and `/review`, never NaN.

---

### Task 0: RLS tightening and the open endpoints

- **Migration** `20261124000001_phase4_learning_loop.sql`:
  - `learning_events`: learner can **insert only**, own `student_id` and same household; staff can do anything in the household.
  - `mistake_notebook`: learner can insert own rows with `source = 'student'`. Learner updates are limited to `resolved_at` and `correction_text` through a guarded function. Staff can do anything in the household.
  - `fsrs_retention_items`: written only by a `security definer` function `record_review(event_id)` that checks the caller owns the event; learners can read their own rows.
  - Answer keys: revoke column `select` on `question_templates.correct_answer, model_answer, mark_scheme` from `authenticated`. Staff read them through `question_templates_with_keys`, a `security invoker` view filtered to staff.
- **Code:** replace `POST /api/learning-events` and `PATCH /api/mistakes` (service role, unauthenticated) with server actions in `src/app/(student)/actions/learning.ts` behind `requireLearnerSession()`, then delete both route files.
- **Tests:** add probes to `scripts/verify-rls.ts` (a learner token can't select key columns, can't update or delete events, can't insert for another learner; an anon POST is gone). Add `scripts/verify-phase4.ts`.

### Task 1 (4.1): `/today` from the timetable

- Pure `src/lib/planning/today.ts`: `groupByPeriod(items, slots)`, `SKIP_REASONS = ["too-hard","no-time","already-know"]`, `reorderWithin(period, from, to)`. Tests come first.
- Actions: `finishItem(id, minutes)` writes `Exposure_Lesson` and sets the item to Done. `skipItem(id, reason)` and `reorderItems(periodId, ids)` persist `student_reordered` and `sort_order`.
- The task card shows the "why this" text from `reasonsFor()`.

### Task 2 (4.2): Checkpoints, practice and trivia

- Answering a checkpoint on `/today` or in trivia writes `Active_Recall` (checkpoint) or `Application_Question` (practice) with `score_ratio`. The answer is checked on the server, because keys are no longer readable by the learner.
- A wrong answer shows "Add to my notebook" with a category picker. The parent can recategorise on `/parent/marking-desk`.
- New `/parent/trivia` authoring form: a YouTube ID and checkpoints at timestamps, written to `trivia_modules` and `trivia_questions`.

### Task 3 (4.3): FSRS

- `pnpm add ts-fsrs`. Pure `src/lib/retention/fsrs.ts`: `ratingFor(score)` and `nextCard(card, rating, now)`, with tests at the boundaries 0.49, 0.5, 0.69, 0.7, 0.89 and 0.9.
- `record_review` runs on every recall, application and assessment event, including the events written by `save_assessment_marks`. It is idempotent per `event_id`.
- `/review` gets two tabs: **Due for review** and **Mistake notebook**. Resolve = correct retry → `Error_Correction`, or parent approval.

### Task 4 (4.4): Mastery and progress

- SQL function `objective_mastery(p_student)` returns objective_id, mastery, coverage flag and last_event_at. It uses the Global Constraints maths, and a TS twin in `src/lib/retention/mastery.ts` is tested against the same fixtures.
- Student `/progress`: syllabus map coloured by mastery, minutes this week vs plan, open mistakes, next exam countdown.
- Parent `/progress`: per subject coverage, assessment average, review compliance and readiness (with the disclaimer).

### Task 5 (4.5): NBA on real inputs

- `rankActivities()` takes its inputs from `objective_mastery` and FSRS due dates: mastery gap, open mistakes, days since last event, days to the next `term_assessment` and FSRS due. This also lands the exam-series proximity deferred from Phase 3.
- Tests for `scoreOf()` boundaries and the generator's packing into a slot's minutes.

### Exit gate

On a throwaway household: the student finishes a lesson and gets one checkpoint wrong. The objective's mastery drops,
an FSRS review is scheduled, and the objective appears in tomorrow's generated plan. Then the branch is merged per
`docs/source-of-truth/workflow.md`.
