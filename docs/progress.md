# Progress

Where the build stands today, expressed as the roadmap's own phases and steps. The plan is
[OpenIGCSE V1 Roadmap.pdf](<../OpenIGCSE V1 Roadmap.pdf>); this file only records how far along it we are.

A phase is **Done** only when its roadmap exit gate has actually been observed. **Built** means the code path exists and
reads or writes Postgres, but the two-device exit gate has not been re-run for this document. **Partial** means only
part of the steps in that phase exist.

Last checked: 2026-11-25 (Phase 5).

| Phase | Roadmap goal                               | State                                                |
| ----- | ------------------------------------------ | ---------------------------------------------------- |
| 0     | Real identity and multi-device foundations | Built; exit gate needs two browsers and two accounts |
| 1     | Repositories replace the demo seam         | Done                                                 |
| 2     | Parent timetable, student follows it       | Built; exit gate needs a phone and a student device  |
| 3     | Parent authoring and the marking desk      | Done (exit gate observed 2026-11-17)                 |
| 4     | The student learning loop                  | Done (exit gate observed 2026-11-25)                 |
| 5     | Messaging, requests and remote monitoring  | Done (exit gate observed 2026-11-25)                 |
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

**Phase 4 - the student learning loop (done).** Step 4.1 rebuilds `/today` from `day_plan_items`; Start, Finish,
Skip and reordering write to Postgres. Step 4.2 makes every checkpoint produce a scored event: `answer_checkpoint()`
writes `Active_Recall` or `Application_Question` on `/today`, `answer_trivia_checkpoint()` writes `Active_Recall` for a
documentary, and a wrong answer offers "Add to my notebook" with a reason the learner picks and a parent can change on
the marking desk. Trivia is household content authored on `/parent/trivia`; learners read `learner_trivia_questions`,
which carries no key, and the correct letter plus explanation come back only after an answer.

Step 4.3 adds spaced review with `ts-fsrs`: `src/lib/retention/fsrs.ts` maps `score_ratio` to a rating and schedules the
next card, and `record_review()` claims each learning event once through `fsrs_review_log`, so two devices answering the
same checkpoint move the card once. Answering a checkpoint folds the event immediately; marking a paper folds the
`Formal_Assessment` events; opening `/review` folds anything left over. `/review` now has two tabs, **Due for review**
(FSRS, with the same checkpoint shown inline) and **Mistake notebook**.

Step 4.4 computes mastery on read. `objective_mastery()` weights each scored event (Formal 1.0, Application 0.8,
Recall 0.6), halves every event's weight every 30 days, and blends the weighted mean 70/30 with FSRS retrievability;
coverage counts any objective with an event. `src/lib/retention/mastery.ts` is the tested twin, including a
`retrievabilityOf()` that matches the SQL forgetting curve and ts-fsrs. The student `/progress` gets a syllabus map
coloured by mastery plus minutes against the plan and the next exam; the parent `/progress` gets per-subject coverage,
assessment average, review compliance and an explicitly unofficial readiness index.

Step 4.5 feeds the planner real inputs: `getLearnerWorkspace()` takes mastery from `objective_mastery()` (the same
number `/progress` shows), last-studied from its `last_event_at`, and a `reviewOverdueDays` signal from each FSRS card's
due date. A due review scores +50 (+1 per overdue day, capped at 7), so below the 70% target it always outranks a
never-studied objective; the exit gate showed that at +15 a missed objective lost to every fresh one. Scoring
boundaries and the period allowance (`allowanceFor`) are pinned in `nextBestActivity.test.ts`. Exit gate observed in
`verify:phase4`: lesson, then a wrong checkpoint, mastery drops, a review is due by tomorrow, and tomorrow's ranking
picks that objective. All migrations are applied.

**Phase 5 - messaging, requests and remote monitoring (done).** Step 5.1 makes a request a typed ask with a decision:
stuck, break, more time, swap, unlock, check my work and day off. The learner can only insert a pending ask for itself
(no update policy, one open ask per type); a guardian answers through `decide_request()`, which applies the effect in
the same transaction (defer the item, start the break clock, extend the sitting, swap two periods, open the focus lock,
mark a sick day). Asks expire after four hours. Step 5.2 adds the household thread with photos and voice notes in the
private bucket, read receipts through `mark_messages_read()` and a typing indicator over a broadcast channel. Step 5.3
writes notification rows from triggers (new request, answer, message, test handed in, idle, digest) and pushes them
from `src/lib/push/notify.ts`, the one app module that uses the service role (Ian's ruling, 2026-11-25), honouring
per-household quiet hours. Step 5.4 adds the 30-second heartbeat (`record_heartbeat()`), `/parent/live` and the
parent's remote actions (`parent_live_action()`): end break, message to the screen, unlock for N minutes, lock now,
end the school day; the digest goes once per day.

## What still looks finished but is not

- **Forms that lose input on error (Phase 0-2).** Onboarding, pairing, settings, PIN gate and overrides use
  `<form action>`, which React 19 resets even when the server refuses.
- **Real household terms 2 and 3** carry Term 1's mid-term and final weeks (old onboarding bug, now fixed); the term
  planner flags them and refuses to save until a parent corrects them.
- **AO tagging** waits for assessment objectives to be imported (none are yet).
  creates a typed request with a decision, and there are no messages, realtime subscription, push or `/parent/live`.
- **Curriculum (Phase 6).** The parser, ingest, validate and import pipeline work, and all ten PDFs are in
  `raw-syllabuses/`. But the five packages in `curriculum-packages/` are still `manual-draft`, `verified: false`, carry
  only 15 objectives each, and 0478, 0500 and 0580 have no entry routes, so those subjects cannot be enrolled.
- **Kiosk (Phase 9).** `src-tauri/` holds four zero-byte files, and the old kiosk components were deleted. Nothing
  enforces focus beyond the `focus_policies` row the parent can edit.

## Known gaps worth fixing on the way through

1. `useLocalDraft` survives only on `/parent/focus`, where the controls are not written to Postgres at all. It should
   go when the focus policy gains a real form.
2. `ARCHITECTURE_MAP.txt` predates Phases 0-2 and still describes bundled JSON curriculum and a demo seam.
3. No service worker, manifest or offline queue yet, so `/today` needs a connection and failed event posts are only
   reported to the learner, not retried.

## Verification

Every command below passed on 2026-11-25 at the current tree:

```powershell
pnpm typecheck      # clean
pnpm test:parser    # 7 passed
pnpm validate       # 5 packages structurally valid
pnpm test:unit      # 151 passed
pnpm test:rls       # 22/22
pnpm verify:phase3  # 34/34, 0 leftovers
pnpm verify:phase4  # 74/74, 0 leftovers (includes the Phase 4 exit gate)
pnpm verify:phase5  # 48/48, 0 leftovers
pnpm verify:push    # Web Push encrypted, delivered once, held by quiet hours
pnpm check:contrast # 56/56 pairs
pnpm build          # clean
```


Step 4.2 was also walked in a browser at 390 px on a throwaway household: a wrong `/today` checkpoint and a wrong
documentary checkpoint each reached the notebook (row `source=student`, linked question on `/review`), the parent
authored and edited a module on `/parent/trivia`, the key never reached the page, and no checked screen scrolled
sideways. The end-of-phase pass (2026-11-25) opened `/today`, `/review`, `/progress`, `/trivia`, a documentary,
`/parent/marking-desk`, `/parent/progress` and `/parent/trivia` at 390 px and 1280 px: no sideways scroll, no console
errors, no NaN. It fixed "in 0 days" wording, a topic count that included parent topic rows, "1 checkpoints", and the
shared `Panel` header, whose action squeezed the description into a narrow column on phones. The earlier
whole-branch Phase 3 review's deferred minors and rulings remain in
`docs/superpowers/plans/2026-11-17-phase3-ledger.md`.

`pnpm check:contrast` and `pnpm test:rls` need a built tree and a linked Supabase project respectively; run them before
claiming a UI or policy change is done. `pnpm build` is the last check, not the first.

Phase 5's exit gate was run in two browsers on a production build: the learner taps Ask, Break; the parent's
`/parent/live` shows it; the parent taps 10 min; the study device shows the countdown 1.4-1.9 s later (four runs).
Messages, read receipts, the typing indicator, screen messages and End break were walked in the same run. Web Push was
verified against a local HTTPS endpoint (`pnpm verify:push`); delivery to a real Android phone and iPhone is still to do
and belongs with Phase 7's installable app (iOS only delivers push to a home-screen app).

## Next, in order

Phase 6 (curriculum extraction), then Phase 7 (mobile pass and installable app, which also carries the real-phone push
check).
Phase 6 runs alongside all of them, starting with the heading and Core/Supplement parser variants that leave 0455 with no
topics and 0460, 0470, 0530 without packages.
