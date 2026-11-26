# Data model

Migrations in `supabase/migrations/` are the authority; this is the map. Helper functions used by policies:
`current_household_id()`, `current_profile_id()`, `is_household_member(h)`, `is_household_staff(h)` (guardian/tutor).

## Identity and household

| Table                 | Purpose                                  | Write access          |
| --------------------- | ---------------------------------------- | --------------------- |
| `households`          | One family, region, timezone             | Staff                 |
| `profiles`            | Guardian / student rows tied to auth users | Staff               |
| `devices`, `kiosk_sessions`, `pin_attempt_logs` | Paired devices, PIN lockout | Staff / server |
| `focus_policies`      | What the study device allows             | Staff                 |

## Curriculum (global, read-only to households; written by the importer)

`awarding_bodies`, `qualifications`, `subjects`, `syllabus_versions`, `components`, `entry_routes`,
`entry_route_components`, `topics`, `learning_objectives`, `assessment_objectives`, `command_words` (Phase 6), `resources`, `activities`.

## Planning

| Table                      | Purpose                                         | Write access |
| -------------------------- | ----------------------------------------------- | ------------ |
| `academic_terms`           | Terms, mid-term and final weeks                 | Staff        |
| `learner_term_enrollments` | Entry routes per learner per term               | Staff        |
| `timetable_slots`          | Weekly pattern                                  | Staff        |
| `timetable_overrides`      | One-date replacements                           | Staff        |
| `day_plan_items`           | Generated daily tasks, unique `(student_id, plan_date, slot_id)`; `skip_reason` | Staff; learner only status/timing/order/carry-over (trigger), Done only via `finish_plan_item` |

## Authoring, assessment and marking (Phase 3)

| Table                   | Purpose                                                     | Write access |
| ----------------------- | ----------------------------------------------------------- | ------------ |
| `question_templates`    | Question bank, including the answer key (`correct_answer`, `model_answer`, `mark_scheme`) | Staff only. Learners read `learner_questions` (keys stripped; paper questions hidden until started) |
| `term_assessments`      | Papers: kind, schedule, duration, thresholds               | Staff        |
| `assessment_items`      | Ordered questions on a paper                                | Staff        |
| `assessment_sittings`   | One sitting per learner per paper; server-owned clock      | Learner starts and hands in; trigger guards |
| `assessment_responses`  | Answers; writable only while `sitting_is_open()`           | Learner      |
| `assessment_item_marks` | Marks per item                                              | Staff via `save_assessment_marks` |
| `evidence_portfolio`    | Uploaded work + review status                               | Learner uploads; staff reviews (trigger guards status) |

Storage: private bucket `household-files`, paths `{household}/{kind}/{profile}/{uuid}.{ext}`, 15 MB, JPEG/PNG/WebP/PDF.

## Learning loop (Phase 4 target)

| Table                  | Purpose                                         | Write access today → target |
| ---------------------- | ----------------------------------------------- | --------------------------- |
| `learning_events`      | Every study action, typed, with `score_ratio`   | Learner inserts only unscored own rows (lesson time, stuck); scored rows via `answer_checkpoint` / `answer_trivia_checkpoint` / `resolve_mistake` / `save_assessment_marks`; staff all in household |
| `mistake_notebook`     | Mistakes from marking or the learner            | Learner inserts own `source=student` (marking mistakes, or "Add to my notebook" from a checkpoint); resolves only via `resolve_mistake`; staff all in household, including changing `error_category` |
| `fsrs_retention_items` | FSRS card per objective                         | Written only by `record_review()`; learners and staff read their own household |
| `fsrs_review_log`      | One row per folded learning event (idempotency, compliance) | Insert only inside `record_review()`; readable by the learner and staff |
| `trivia_modules`, `trivia_questions` | Documentary checkpoints, household-scoped | Staff author on `/parent/trivia`; learners read `learner_trivia_questions` (no `correct_letter` or `explanation`) and answer through `answer_trivia_checkpoint` |

Mastery is never stored: `objective_mastery()` computes it on every read from `learning_events` and the FSRS card, and
coverage is any objective with an event. Review compliance comes from `fsrs_review_log.previous_due_at / on_time`.

## Messaging and live monitoring (Phase 5)

- `requests`: typed asks (`stuck`, `break`, `more_time`, `swap`, `unlock`, `check_work`, `day_off`), status
  `pending/approved/declined/expired`, `decision`, `effect_until`. Learners insert pending rows only; one open ask per
  type (partial unique index). `decide_request()` answers and applies the effect; `expire_stale_requests()` after 4 h.
- `messages`: one thread per household; `attachment_path/kind` (`image`, `voice`) under
  `{household}/messages/{sender}/` in `household-files`. No update policy; `mark_messages_read()` sets receipts.
- `notifications`: written only by triggers (request, request_decided, message, test_submitted, idle, digest); each
  recipient reads its own; `pushed_at` marks Web Push delivery.
- `push_subscriptions`: one row per device endpoint, readable and writable only by its own profile.
- `households.quiet_hours_start/end`: pushes are held inside this local window.
- `kiosk_sessions`: one row per learner per local day, written by `record_heartbeat()`; carries route, item, focus,
  timer, idle spell, screen message, day end and digest stamps. `parent_live_action()` drives remote actions.
- `assessment_sittings.extra_minutes`: approved "more time"; `sitting_is_open()` and `save_assessment_marks()` add it.

## Functions

| Function                     | What                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `save_assessment_marks(...)` | Marks + mistakes + `Formal_Assessment` events in one transaction |
| `sitting_is_open(id)`        | Duration + 2 min grace                                    |
| `assessment_sittings_guard`  | Trigger: the server owns `started_at`, `deadline_at` and `submitted_at` |
| `evidence_portfolio_guard`   | Trigger: learners cannot set status or feedback          |
| `device_session_state`       | Revoked-device check for middleware                       |
| `answer_checkpoint(q, option, kind)` | Server-side MCQ check; writes the scored Active_Recall / Application_Question event |
| `answer_trivia_checkpoint(q, option)` | Server-side documentary check; writes an Active_Recall event with no objective (Step 4.2) |
| `pending_review_events(student, limit)` | Scored events with no FSRS row yet, oldest first (Step 4.3) |
| `record_review(event, rating, card)` | Claims the event once in `fsrs_review_log` and upserts the card; returns `applied = false` on a replay (Step 4.3) |
| `fsrs_retrievability(stability, last_reviewed_at, now)` | FSRS-6 forgetting curve with the whole-day floor ts-fsrs uses (Step 4.4) |
| `objective_mastery(student)` | Per objective: recency-weighted event mastery, FSRS retrievability, the 70/30 blend and coverage (Step 4.4) |
| `review_compliance(student)` | Reviews that had a due date, and how many beat it (Step 4.4) |
| `finish_plan_item(id, minutes)` | Done + one Exposure_Lesson, idempotent (Step 4.1) |
| `resolve_mistake(id, option?, correction?)` | Correct retry → resolved + Error_Correction; else correction waits for a parent |
