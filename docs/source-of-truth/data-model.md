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
`entry_route_components`, `topics`, `learning_objectives`, `assessment_objectives`, `resources`, `activities`.

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
| `learning_events`      | Every study action, typed, with `score_ratio`   | Learner inserts only unscored own rows (lesson time, stuck); scored rows via `answer_checkpoint` / `resolve_mistake`; staff all in household |
| `mistake_notebook`     | Mistakes from marking or the learner            | Learner inserts own `source=student`; resolves only via `resolve_mistake`; staff all in household |
| `fsrs_retention_items` | FSRS card state per objective                   | Nothing writes it yet → server on each recall/assessment event |
| `trivia_modules`, `trivia_questions` | Documentary checkpoints           | Staff authoring form in 4.2 |

## Messaging (Phase 5 scaffolding)

`requests`, `messages`, `notifications`, `push_subscriptions`: tables exist; no flows yet.

## Functions

| Function                     | What                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `save_assessment_marks(...)` | Marks + mistakes + `Formal_Assessment` events in one transaction |
| `sitting_is_open(id)`        | Duration + 2 min grace                                    |
| `assessment_sittings_guard`  | Trigger: the server owns `started_at`, `deadline_at` and `submitted_at` |
| `evidence_portfolio_guard`   | Trigger: learners cannot set status or feedback          |
| `device_session_state`       | Revoked-device check for middleware                       |
| `answer_checkpoint(q, option, kind)` | Server-side MCQ check; writes the scored Active_Recall / Application_Question event |
| `finish_plan_item(id, minutes)` | Done + one Exposure_Lesson, idempotent (Step 4.1) |
| `resolve_mistake(id, option?, correction?)` | Correct retry → resolved + Error_Correction; else correction waits for a parent |
