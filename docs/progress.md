# Progress

Where the build stands today, expressed as the roadmap's own phases and steps. The plan is
[OpenIGCSE V1 Roadmap.pdf](<../OpenIGCSE V1 Roadmap.pdf>); this file only records how far along it we are.

A phase is **Done** only when its roadmap exit gate has actually been observed. **Built** means the code path exists and
reads or writes Postgres, but the two-device exit gate has not been re-run for this document. **Partial** means only
part of the steps in that phase exist.

Last checked: 2026-11-17.

| Phase | Roadmap goal                               | State                                                |
| ----- | ------------------------------------------ | ---------------------------------------------------- |
| 0     | Real identity and multi-device foundations | Built; exit gate needs two browsers and two accounts |
| 1     | Repositories replace the demo seam         | Done                                                 |
| 2     | Parent timetable, student follows it       | Built; exit gate needs a phone and a student device  |
| 3     | Parent authoring and the marking desk      | Done (exit gate observed 2026-11-17)                 |
| 4     | The student learning loop                  | Partial: events are written, retention is not        |
| 5     | Messaging, requests and remote monitoring  | Scaffolding only                                     |
| 6     | Curriculum extraction for ten packages     | Partial: five drafts, three have no route            |
| 7     | Mobile pass and installable app            | Not started                                          |
| 8     | Hardening and staging                      | Not started                                          |
| 9     | Device lockdown app                        | Not started                                          |

## What a session can rely on

**Phase 0 - identity.** `/login` signs a guardian in by password or magic link, `/auth/callback` exchanges the code,
`/pair` redeems a six-digit code to give a learner device its own Supabase session, and `src/middleware.ts` refreshes the
cookie and signs out a revoked device. Onboarding creates the household after the auth account, and every parent write
is gated by the PIN with a five-attempt lockout; outside production the gate also prints the development PIN as a hint.
`public.current_household_id()` and `public.current_profile_id()` back the policies, and `pnpm test:rls` probes them.

**Phase 1 - data seam.** `src/lib/data/` has one module per entity, all on the session-bound server client;
`getSetupState()` resolves the household, learner and running term once per request; `getLearnerWorkspace()` composes the
rest. Curriculum is read from Postgres through `curriculum.ts`, scoped to the learner's enrolled entry routes. The only
surviving demo path is `DEMO_MODE=true` on `/today`.

**Phase 2 - timetable.** `/parent/timetable` draws the week (palette, drag, resize on a 15-minute grid, keyboard
equivalents), `/parent/timetable` overrides replace a single date, `/timetable` is the read-only learner week, and
`/today` opens with a now line, current period and next start. `generateDayPlan()` picks one objective per slot, rolls
unfinished items forward, and leans on the unique index on `(student_id, plan_date, slot_id)` for idempotency. Student
reordering inside a period is React state only; it does not write `day_plan_items.student_reordered`.

**Phase 3 - authoring and marking.** Term planner writes (3.1), question bank (3.2), assessment builder (3.3), sitting
screen (3.4), marking desk through `save_assessment_marks` (3.5) and evidence review (3.6). Exit gate run verbatim in
two browser sessions on a throwaway household: 3-question quiz, sat, one question marked down, mistake on `/review`,
Resolve persisted. Plan and rulings: `docs/superpowers/plans/2026-11-17-phase3-authoring-and-marking.md`.

## What still looks finished but is not

- **Answer keys (Phase 3, fix in 4.2/8).** Pages never send answer keys, but RLS lets any household member read
  `question_templates` columns through the REST API with their own token.
- **Forms that lose input on error (Phase 0-2).** Onboarding, pairing, settings, PIN gate and overrides use
  `<form action>`, which React 19 resets even when the server refuses.
- **Real household terms 2 and 3** carry Term 1's mid-term and final weeks (old onboarding bug, now fixed); the term
  planner flags them and refuses to save until a parent corrects them.
- **AO tagging** waits for assessment objectives to be imported (none are yet).
- **Review (Phase 4.3).** `/review` lists mistakes and lets the learner resolve one, but there is no FSRS tab.
  `getRetention()` only reads `fsrs_retention_items`; nothing writes it, so mastery renders as zero.
- **Checkpoints (Phase 4.2).** The stopwatch posts `Exposure_Lesson`, and the stuck button posts an
  `Application_Question` with `flagged_stuck`; answering a checkpoint writes nothing.
- **Requests (Phase 5.1).** `getRequests()` reads the table and the parent overview counts them, but no learner flow
  creates a typed request with a decision, and there are no messages, realtime subscription, push or `/parent/live`.
- **Curriculum (Phase 6).** The parser, ingest, validate and import pipeline work, and all ten PDFs are in
  `raw-syllabuses/`. But the five packages in `curriculum-packages/` are still `manual-draft`, `verified: false`, carry
  only 15 objectives each, and 0478, 0500 and 0580 have no entry routes, so those subjects cannot be enrolled.
- **Kiosk (Phase 9).** `src-tauri/` holds four zero-byte files, and the old kiosk components were deleted. Nothing
  enforces focus beyond the `focus_policies` row the parent can edit.

## Known gaps worth fixing on the way through

1. `POST /api/learning-events` and `PATCH /api/mistakes` use the service-role client and assume "one student per
   household". That contradicts Phase 0 step 0.2 ("move all reads off `createAdminClient()`") and will break the first
   time a household has a second learner.
2. `useLocalDraft` survives only for the marking desk; it should disappear with Phase 3 rather than spread.
3. `ARCHITECTURE_MAP.txt` predates Phases 0-2 and still describes bundled JSON curriculum and a demo seam.
4. No service worker, manifest or offline queue yet, so `/today` needs a connection and failed event posts are only
   reported to the learner, not retried.

## Verification

Every command below passed on 2026-11-17 at the current tree:

```powershell
pnpm typecheck      # clean
pnpm test:parser    # 7 passed
pnpm validate       # 5 packages structurally valid
pnpm test:unit      # 53 passed
pnpm test:rls       # 22/22
pnpm verify:phase3  # 34/34, 0 leftovers
pnpm test:unit      # 60 passed after the review fixes
pnpm check:contrast # 56/56 pairs
pnpm build          # clean
```

A fresh whole-branch review found one critical and two important issues (a stale second device could blank
answers, hand-in after a failed save, editing questions on sat papers); all three are fixed with tests and re-checked in
the browser. Deferred minors and every ruling are in `docs/superpowers/plans/2026-11-17-phase3-ledger.md`.

`pnpm check:contrast` and `pnpm test:rls` need a built tree and a linked Supabase project respectively; run them before
claiming a UI or policy change is done. `pnpm build` is the last check, not the first.

## Next, in order

Phase 4 next, starting with Step 4.2 RLS tightening (answer keys, learner-writable events and mistakes). Then Phase 4 (FSRS with `ts-fsrs`, the mastery view, checkpoint events), then Phase 5.
Phase 6 runs alongside all of them, starting with the heading and Core/Supplement parser variants that leave 0455 with no
topics and 0460, 0470, 0530 without packages.
