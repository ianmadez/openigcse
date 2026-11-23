# Phase 3 - Parent authoring and the marking desk

Merged to `main` on 2026-11-24 from branch `phase-3` (commits `407eaee..5af6a74`).
Exit gate observed 2026-11-17: the parent built a 3-question quiz, the learner sat it, the parent marked one question
down, and the mistake appeared on the learner's `/review` page. Resolve saved.

## What it contains

| Step | Delivered                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 3.1  | `/parent/term-planner` saves to `academic_terms` and `learner_term_enrollments`. There is no more `localStorage`. Exam-series countdown. |
| 3.2  | `/parent/questions`: bank of MCQ, short-answer and structured questions. LaTeX via KaTeX; diagrams go to private storage. |
| 3.3  | `/parent/assessments`: build a paper, then schedule it onto the learner's timetable day.               |
| 3.4  | `(sitting)/assessments/[id]`: a distraction-free sitting with a server-owned clock, 2-minute grace and autosave. |
| 3.5  | `/parent/marking-desk`: one transaction (`save_assessment_marks`) writes marks, mistakes and `Formal_Assessment` events. |
| 3.6  | Learner `/evidence` upload and the parent's review queue.                                              |

Migration: `supabase/migrations/20261117000001_phase3_authoring_and_marking.sql` (pushed to production).
New checks: `pnpm test:unit` (60 tests) and `pnpm verify:phase3` (34 DB checks on throwaway households).

## Review findings fixed before merge

- A stale second device could blank answers. Autosave now sends only the questions that changed.
- Hand-in went through after a failed save while time was left. Hand-in is now blocked unless the save succeeds, except for the automatic hand-in when time runs out.
- Questions on papers that had already been sat could be edited. Those questions are now locked.

## Carried forward

- Answer keys can be read over REST by learners. This is the first job of Phase 4.
- The learner can write to their own `learning_events` and `mistake_notebook`. This is also the first job of Phase 4.
- The older `<form action>` screens lose input on error.
- AO tagging waits for imported assessment objectives.
- Real household Terms 2 and 3 carry Term 1's exam weeks. A parent must correct them in the term planner.
- Rulings and deferred minors: [../superpowers/plans/2026-11-17-phase3-ledger.md](../superpowers/plans/2026-11-17-phase3-ledger.md).
