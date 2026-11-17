# SDD ledger — plan: docs/superpowers/plans/2026-11-17-phase3-authoring-and-marking.md
Spec: OpenIGCSE V1 Roadmap.pdf Phase 3 (read). Branch phase-3 from 407eaee.
Pre-flight: T2 produces scoring fns consumed by T5 (pickWeakest), T6 (none), T7 (autoMarkMcq, validateMarks, estimateGrade) — consistent. T1 RPC save_assessment_marks consumed by T7 and T9 — signature (p_assessment_id,p_student_id,p_marks jsonb,p_feedback) consistent. T4 uploadHouseholdFile consumed by T6/T8 — consistent.
Task 1: Ruling: exit-gate DB probe (scripts/verify-phase3.ts) moved from Task 9 to Task 1 — the marking RPC is the riskiest SQL and every later screen builds on it — cost if wrong: none, Task 9 reuses it.
Task 1: Ruling: re-marking a question up to full deletes its open (unresolved) marking mistake; resolved ones stay — a mistake that no longer exists should not ask to be fixed, but a fix the learner did stays on record — cost if wrong: one delete clause.
Task 1: Ruling: marking allowed without any sitting (past papers sat on paper); refused only while a sitting is open and in time — cost if wrong: parent could mark an unsat online quiz as all-zero.
Task 1: Ruling: verify-rls read probe switched from HEAD to GET — HEAD hid PGRST205 on missing tables — cost if wrong: none.
Task 1: complete (commits 407eaee..9ba6be0, tests: pnpm test:rls → 22/22; pnpm verify:phase3 → 34/34, 0 leftovers)
Task 2: Ruling: validateMarks failure also returns questionId so the desk can point at the offending row — additive to the plan signature — cost if wrong: none.
Task 2: complete (commits 9ba6be0..ca03472, tests: pnpm test:unit → 16/16; typecheck clean)
Task 3: Ruling: existing terms are updated by id and their names are read-only; only new terms upsert on (household,name) — upserting a renamed term by name would fork it into a duplicate row — cost if wrong: parent cannot rename a term in the UI.
Task 3: Ruling: exam-series proximity into the NBA deferred to Step 4.5 — rankActivities only weighs proximity inside 14 days, and 4.5 is "NBA on real inputs"; 3.1 stores the series per enrolment and shows the countdown — cost if wrong: series has no planning effect until 4.5.
Task 3: Ruling: fixed onboarding copying one mid-term/final week onto all three terms (pre-existing; real household terms 2 and 3 carry 2026-10-19 / 2026-11-30, inside Term 1). Real data NOT edited; planner flags it and refuses saves until the parent corrects it — cost if wrong: parent must fix two dates before the first save.
Task 3: Ruling: "Use these subjects for every term" (default on) — onboarding enrols all terms, editing one would leave the others stale — cost if wrong: one checkbox.
Task 3: complete (commits ca03472..05ce48b, tests: pnpm test:unit → 19/19; typecheck clean; browser: save+reload persists, invalid range alert, 375px no overflow, no console errors)
Task 4: Ruling: AO picker lists only imported assessment_objectives; none are imported for any syllabus yet, so AO tag stays empty with an on-screen note — no invented AO1/2/3 (CLAUDE.md rule 4) — cost if wrong: AO-level analysis waits for Phase 6 imports.
Task 4: Ruling: deleting a question that is on any assessment is refused — FK on delete cascade would silently remove items and marks from marked papers — cost if wrong: parent must detach first.
Task 4: Ruling: diagrams limited to images (no PDF) and 4 per question; Markdown <img> disallowed so only uploaded files render — cost if wrong: none.
Task 4: complete (commits 05ce48b..53c873f, tests: pnpm test:unit → 32/32; typecheck clean; browser: MCQ+diagram+maths save/reload, LaTeX byte-identical round trip, structured=5 marks, filter, delete, 375px no overflow, 0 console errors)
Task 5: Ruling: "drops into the timetable as an Assessment override" implemented as a day_plan_items row always, plus an exam_day override only when the parent ticks it and the date has none — a whole-day override for a 20-minute quiz would wipe the normal day — cost if wrong: one checkbox default.
Task 5: Ruling: zone shown as information only; no variant is suggested — the zone-to-variant mapping is Cambridge data we do not have (CLAUDE.md rule 4) — cost if wrong: parent looks the variant up.
Task 5: Ruling: past-paper questions are stored as Structured bank questions whose prompt names the paper and question number, not Cambridge text — copyright and rule 4 — cost if wrong: none.
Task 5: Ruling: assessment locked for edits once any sitting exists; un-scheduling removes the planned day item but leaves an exam_day override (it may be the parent own) and says so — cost if wrong: parent removes override by hand.
Task 5: complete (commits 53c873f..e22246a, tests: pnpm test:unit → 42/42; typecheck clean; browser: create, invalid thresholds/http link refused, auto-pick, save+reload, schedule writes day item + override, unschedule clears, past paper rows, 375px no overflow, 0 console errors)
Task 6: Ruling: sitting route lives in its own (sitting) route group with a minimal layout (no shell/nav/sound) — roadmap says distraction-free — cost if wrong: none.
Task 6: Ruling: structured answers are one text box pre-filled with (a)/(b) labels rather than one box per part — answer_text is a single column and the marking desk shows it verbatim — cost if wrong: learner can blur part boundaries.
Task 6: Ruling (KNOWN GAP, deferred to Phase 4.2/8): the page never sends answer keys, but RLS lets any household member read question_templates columns (options correct flags, model_answer, mark_scheme_rubric) via the REST API with their own JWT. Fix needs column privileges + a staff-only read RPC and touches Phase 4 checkpoint marking — cost if wrong: a learner with devtools can read answers.
Task 6: complete (commits e22246a..06ec5db, tests: pnpm test:unit → 46/46; typecheck clean; browser as learner: no questions before Start, no answer key in HTML, autosave <10s, reload restores text+photo, hand-in writes submitted_at then read-only, 390px no overflow, 0 console errors)
Task 7: Ruling: a wrong MCQ starts tagged ConceptGap (visible and changeable) so auto-marked misses reach the notebook without a click per item — roadmap says "asks for an error category"; the category is still shown and editable — cost if wrong: parent must re-tag slips.
Task 7: Ruling: available marks for validation are re-read from Postgres in the action, never trusted from the form — cost if wrong: none.
Task 7: complete (commits 06ec5db..4d74284, tests: pnpm test:unit → 50/50; typecheck clean; EXIT GATE in browser: guardian marks Q2 down 3/5, save refused without reason and nothing written, then saved → Marked 66.67%, 1 IncompleteExplanation mistake with learner answer, Formal_Assessment 0.6667; learner /review shows it, Resolve persists resolved=true, learner sees 3/5 + feedback; 375px desk overflow fixed and rechecked; 0 console errors)
Task 8: Ruling: NeedsCorrection (existing DB value) is labelled "Changes requested" everywhere instead of migrating the check constraint — cost if wrong: none visible.
Task 8: Ruling: "request changes" requires a note; approve does not — a learner cannot fix what is not named — cost if wrong: one extra field.
Task 8: Finding (not fixed, out of scope): six pre-Phase-3 forms use <form action={...}> (onboarding, pairing, settings, PIN gate, overrides) and React 19 resets them after the action even on error, wiping typed input — reported to user.
Task 8: complete (commits 4d74284..9c88de4, tests: pnpm test:unit → 53/53; typecheck clean; browser: gif refused keeps typing (bug found+fixed), pdf saved, change request w/o note refused, NeedsCorrection+feedback shown to learner, corrected version linked + approved, 375px both sides, 0 console errors)
Task 9: pnpm build exit 0; check:contrast 56/56; time-up auto hand-in verified in browser (submitted 5m05s after start, last answer kept); verbatim exit gate passed in browser (3 questions, 60%, ConceptGap on /review, resolved=true).
Final review: fresh reviewer (opus). Verdict: ready to merge with fixes. SQL/RLS/RPC held.
Final: fixed stale second device blanks answers (Critical 1) — pendingResponses tests RED→GREEN, suite 60/60; browser: device A answer survived device B autosave + hand-in.
Final: fixed hand-in after failed save with time left (Important 2) — handInAfterSave tests RED→GREEN, suite 60/60; automatic hand-in never retries.
Final: fixed editing questions on sat/marked papers (Important 3) — questionEditBlock tests RED→GREEN, suite 60/60; browser: edit refused with message.
Final: minor (deferred): parent can mark during the 2-minute grace (RPC uses bare duration, sitting_is_open uses +2).
Final: minor (deferred): hand-in success message lost on remount after router.refresh (handed-in callout still shows).
Final: minor (deferred): learner can edit content/delete Approved evidence via REST (status frozen); same devtools class as answer keys.
Final: minor (deferred): "Use these subjects for every term" also rewrites completed terms.
Final: minor (deferred): saveTerms still sends name on update, so name read-only is UI-only.
Final: minor (deferred): getObjectiveRatios subject to PostgREST 1000-row cap.
Final: minor (deferred): assessment edit lock is app-level only (race with a starting sitting).
Final: minor (deferred): startSitting surfaces raw RLS message when paper is no longer Scheduled.
Final: Ruling: Task 3 exam-series→NBA deferral is a deviation from Step 3.1 wording ("feeding the NBA proximity input"), recorded as such — cost if wrong: series has no planning effect until 4.5.
Final: Ruling: declined-to-judge pre-Phase-3 student "for all" policies on learning_events/mistake_notebook (learner could forge events or delete marking mistakes via REST) — stand for now, belong with the 4.2 RLS tightening alongside the answer-key gap — cost if wrong: devtools-level tampering by the learner.
