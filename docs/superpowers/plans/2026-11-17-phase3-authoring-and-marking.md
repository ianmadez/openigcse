# Phase 3: Parent Authoring and the Marking Desk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The parent can set terms, write questions, build tests and past-paper sittings, mark them, and every lost mark
lands in the learner's mistake notebook (roadmap Phase 3, Steps 3.1-3.6).

**Architecture:** One additive migration adds the missing tables (`assessment_sittings`, `assessment_responses`), the
columns the steps need, a private Storage bucket, and closes the cross-household write leaks on `question_templates`,
`assessment_items` and `assessment_item_marks`. Parent writes go through `authorizeGuardian()` plus repositories on the
session client, so RLS decides. Marking is one Postgres function (`save_assessment_marks`, security invoker) so marks,
mistakes and events land in one transaction or not at all. Pure scoring logic lives in `src/lib/assessment/` with
`node:test` unit tests.

**Tech Stack:** Next.js 15 server actions, Supabase Postgres + Storage, zod 4, `react-markdown` + `remark-math` +
`rehype-katex` + `katex` for the preview, `node:test` via `tsx --test`.

**Spec:** `OpenIGCSE V1 Roadmap.pdf`, Phase 3 (pages 5-6). Rules: `CLAUDE.md`, `docs/working-practices.md`.

## Global Constraints

- Every read and write in app code goes through `src/lib/data/*` on `createServerClientInstance()`; the service-role
  client is not used by any new Phase 3 path.
- Every new household-scoped table has `household_id` and its RLS policy in the same migration.
- Failed writes render a visible error (`role="alert"`); no `localStorage` fallback. Delete `openigcse.term-plan` and
  `openigcse.marking-desk` drafts.
- Design tokens only (`bg-card`, `text-secondary`, `border-subtle`, ...); motion respects `prefers-reduced-motion`.
- Mobile layout checked per screen at 375px.
- No invented syllabus content: assessment objectives, components, zones/variants and grade thresholds come from rows or
  from what the parent types. No variant is "suggested" by a rule we made up.
- Student never receives answer keys (`correct` flags, `model_answer`, `mark_scheme_rubric`) in sitting-screen props.
- A student can never write marks, `term_assessments`, or another learner's rows.
- Marks are whole numbers from 0 to the item's `marks_available`.

## Review Focus

1. Parent re-saves marks for an already-marked sitting → no duplicate mistakes or events (upsert on natural keys).
2. Timer runs out or the tab reloads mid-sitting → answers since the last autosave (≤10 s) survive; expiry submits.
3. Student opens a sitting twice on two devices → one `assessment_sittings` row (unique), latest answer wins.
4. Parent marks a question down but picks no error category → save is refused with a visible message, nothing written.
5. Guardian unlocked by PIN only (no Supabase session) → writes are refused by RLS and the screen says to sign in.

---

### Task 1: Migration — schema, policies, storage, marking function

**Files:**
- Create: `supabase/migrations/20261117000001_phase3_authoring_and_marking.sql`
- Modify: `scripts/verify-rls.ts` (add the two new tables to the anon/zero-row and refused-write probes)

**Produces (schema):**
- `question_templates`: `+ household_id uuid not null references households`, `+ tier text default 'Both' check in
  ('Core','Extended','Both')`, `+ model_answer text`, `+ parts jsonb default '[]'` (`[{label, prompt, marks}]`),
  `+ image_paths text[] default '{}'`, `+ updated_at`; `question_type` check gains `'ShortAnswer'`. Policies: read and
  write = same household (`household_id = current_household_id()`), write also `is_household_staff()`.
- `term_assessments`: `+ student_id`, `+ paper_code`, `+ exam_series`, `+ paper_variant`, `+ paper_url`,
  `+ grade_thresholds jsonb default '[]'` (`[{grade, minPercent}]`), `+ marked_at`.
- `assessment_items` / `assessment_item_marks` write policies: staff **and** the item's assessment's term belongs to
  `current_household_id()`.
- `assessment_sittings (id, household_id, student_id, assessment_id, started_at, submitted_at, unique(assessment_id,
  student_id))`. Student inserts/updates own row only while `submitted_at is null`; staff in household read/update.
- `assessment_responses (id, household_id, student_id, assessment_id, question_template_id, selected_option, answer_text,
  photo_paths text[], updated_at, unique(assessment_id, student_id, question_template_id))`. Student writes own rows only
  while their sitting is unsubmitted; staff in household read.
- `mistake_notebook`: `+ question_template_id`, `+ source text default 'marking' check in ('marking','student')`; unique
  index on `(term_assessment_id, question_template_id)` where both not null.
- `learning_events`: `+ term_assessment_id`; unique index on `(term_assessment_id, objective_id)` where
  `event_type = 'Formal_Assessment'`.
- `evidence_portfolio`: `+ household_id`, `+ title`, `+ mime_type`, `+ byte_size`, `+ reviewed_at`.
- `academic_terms`: unique index `(household_id, name)`.
- Storage bucket `household-files` (private, 15 MB, `image/jpeg,image/png,image/webp,application/pdf`); object policies:
  first path segment must equal `current_household_id()::text`.
- `public.save_assessment_marks(p_assessment_id uuid, p_student_id uuid, p_marks jsonb, p_feedback text) returns jsonb`,
  `security invoker`: upserts marks, upserts one mistake per dropped mark, upserts one `Formal_Assessment` event per
  objective with the score ratio, sets `term_assessments` `status='Marked'`, `student_score`, `marked_at`. Raises if a
  dropped mark has no category or a mark is outside `0..marks_available`.

- [ ] Write the migration; `npx supabase@3.2.0 db push --dry-run` lists only this file.
- [ ] Push (after the user approves), `migration list` shows it remote.
- [ ] `pnpm test:rls` passes, including the new tables.
- [ ] Commit.

### Task 2: Pure assessment logic with tests

**Files:** Create `src/lib/assessment/scoring.ts`, `src/lib/assessment/scoring.test.ts`; add
`"test:unit": "tsx --test src/lib/**/*.test.ts"` to `package.json`.

**Produces:**
- `autoMarkMcq(selected: string | null, correct: string, marks: number): number`
- `validateMarks(items: MarkInput[]): { ok: true } | { ok: false; error: string }` where
  `MarkInput = { questionId; available; awarded; errorCategory: ErrorTag | null }`
- `objectiveRatios(items: Array<{ objectiveId: string | null; available; awarded }>): Map<string, number>`
- `estimateGrade(percent: number, thresholds: Array<{ grade: string; minPercent: number }>): string | null`
- `pickWeakest(candidates: Array<{ id; objectiveId }>, ratioByObjective: Map<string, number>, n: number): string[]`
  (unseen objectives rank weakest; stable by input order)

- [ ] Tests: MCQ right = full marks, wrong/blank = 0; 1.5 or 5/4 rejected; dropped mark without category rejected;
  ratio for two items on one objective (2/3 + 1/1 → 0.75); grade with thresholds `[{A,70},{B,60}]` at 65 → `B`, below all
  → `null`, empty thresholds → `null`; `pickWeakest` returns n ids, unseen first.
- [ ] Implement; `pnpm test:unit` passes. Commit.

### Task 3: Step 3.1 — Term planner writes

**Files:** Create `src/app/(parent)/parent/(gated)/term-planner/actions.ts`; modify `src/lib/data/terms.ts`,
`src/lib/data/enrollments.ts`, `src/components/parent/TermPlanner.tsx`, `term-planner/page.tsx`.

**Produces:** `saveTermPlanAction(input)` → `{ ok: true } | { ok: false; error }`; repository functions
`upsertTerms(householdId, terms[])` (on conflict `household_id,name`) and
`replaceEnrollments(learnerId, termId, rows[])` (upsert on `student_id,academic_term_id,entry_route_id`; deletes rows
for routes no longer selected). `getRouteOptions()` returns each subject's routes with `privateCandidateEligible`.

- [ ] Planner edits real terms (every term on file, not a hard-coded three), per-subject route picker with an inline
  warning when `private_candidate_eligible = false`, weekly minutes, target exam series and a countdown to the first
  day of that series' month (labelled as such). Remove `useLocalDraft` and the "Draft only" callout.
- [ ] Save, reload, values persist; a refused write shows its message. Typecheck. 375px check. Commit.

### Task 4: Step 3.2 — Question bank

**Files:** Create `src/lib/data/question-bank.ts`, `src/app/(parent)/parent/(gated)/questions/{page,actions}.ts(x)`,
`questions/new/page.tsx`, `questions/[id]/page.tsx`, `src/components/parent/QuestionEditor.tsx`,
`src/components/ui/MathMarkdown.tsx`, `src/lib/storage/files.ts`; add nav item; set
`experimental.serverActions.bodySizeLimit = "16mb"` in `next.config.mjs`.

**Produces:** `listQuestions(householdId, filters)`, `getQuestion(id)`, `saveQuestion(input)`; `saveQuestionAction`,
`deleteQuestionAction`, `uploadQuestionImageAction(formData)`; `uploadHouseholdFile(householdId, kind, file)` →
`{ ok, path }` validating type and 15 MB; `signedUrls(paths[])`.

- [ ] Filters: subject, topic, objective, tier, kind, difficulty (searchParams). Kinds: MCQ (4 options + correct letter),
  ShortAnswer, Structured (parts with marks; `max_marks` = sum), CalculationTemplate. Objective required; AO picker lists
  the version's `assessment_objectives` rows (and says so when there are none).
- [ ] Preview renders Markdown + KaTeX, no raw HTML. Save, reload, edit, delete. Commit.

### Task 5: Step 3.3 — Assessment builder

**Files:** Create `src/app/(parent)/parent/(gated)/assessments/{page,actions}.ts(x)`, `assessments/[id]/page.tsx`,
`src/components/parent/AssessmentBuilder.tsx`; extend `src/lib/data/assessments.ts`.

**Produces:** `createAssessment`, `setAssessmentItems(assessmentId, items[])`, `getAssessmentDetail(id)`;
actions `saveAssessmentAction`, `autoPickAction(assessmentId)` (uses `pickWeakest` over the learner's event ratios),
`addPastPaperQuestionsAction` (creates `Structured` templates per paper question with marks and objective).

- [ ] Kinds map to DB values WeeklyQuiz, TopicTest, MidTermExam, FinalTermExam, TimedPastPaper. Past paper records code,
  series, variant, PDF link; shows the household's Cambridge zone as information only. `total_marks` = sum of items.
  Grade thresholds typed by the parent. Scheduling adds a `day_plan_items` row (`item_type='assessment'`,
  `term_assessment_id`) on that date; "make it an exam day" optionally writes an `exam_day` override. Commit.

### Task 6: Step 3.4 — Student sitting screen

**Files:** Create `src/lib/data/sittings.ts`, `src/app/(student)/assessments/page.tsx`,
`src/app/(student)/assessments/[id]/{page,actions}.ts(x)`, `src/components/student/SittingRunner.tsx`; add nav item.

**Produces:** `getSittingView(assessmentId, learnerId)` (no answer keys), `startSitting`, `saveResponses`,
`submitSitting`; actions `startSittingAction`, `autosaveAction`, `submitSittingAction`, `uploadWorkingAction`.

- [ ] Distraction-free layout, timer from server `started_at + duration`, autosave every 10 s and on blur/visibility
  change, visible "Saved hh:mm:ss" or error, photo upload, submit and auto-submit at zero. Reload restores answers.
  Commit.

### Task 7: Step 3.5 — Marking desk writes

**Files:** Rewrite `src/components/parent/MarkingDesk.tsx`, `marking-desk/page.tsx`; create
`marking-desk/actions.ts`, `src/lib/data/marking.ts`.

**Produces:** `getMarkingQueue(householdId)`, `getMarkingSheet(assessmentId, learnerId)`, `saveMarks(...)` calling the
RPC; `saveMarksAction`.

- [ ] Per item: student answer (and working photos) beside model answer and marking guide; whole-number input
  0..available; MCQ prefilled by `autoMarkMcq`; any dropped mark demands a category. Totals, percent, grade estimate.
  Re-saving updates in place. Delete the `localStorage` draft. Commit.

### Task 8: Step 3.6 — Evidence review

**Files:** Create `src/lib/data/evidence.ts`, `src/app/(student)/evidence/{page,actions}.ts(x)`,
`src/components/student/EvidenceUpload.tsx`, `src/components/parent/EvidenceQueue.tsx`; modify parent overview page.

- [ ] Student uploads JPEG/PNG/WebP/PDF ≤15 MB to `{household}/evidence/...`, row status `Submitted`. Parent queue on
  `/parent` with Approve / Request changes (`NeedsCorrection`, labelled "Changes requested") + feedback. Commit.

### Task 9: Exit gate and docs

**Files:** Create `scripts/verify-phase3.ts` (`pnpm verify:phase3`); modify `docs/progress.md`, `README.md`.

- [ ] Script creates a throwaway household, guardian and learner (admin API), then **with their own JWTs**: guardian
  writes 3 questions and a quiz; learner starts, answers, submits; learner cannot write marks or read another
  household; guardian calls `save_assessment_marks` with one question marked down; learner reads the mistake and resolves
  it. Deletes everything it created in `finally`.
- [ ] Same flow by hand in the browser at desktop and 375px.
- [ ] `pnpm typecheck`, `test:unit`, `test:parser`, `validate`, `check:contrast`, `test:rls`, `build` all pass; update
  progress with the output and date. Final whole-branch review. Commit.
