# Done work against the roadmap

Every step in [OpenIGCSE V1 Roadmap.pdf](<../OpenIGCSE V1 Roadmap.pdf>), with its state. This is the checklist; the
narrative of each finished phase is in [docs/phases/](phases/), and the honest gap list is in [progress.md](progress.md).

Legend: **Done** = built and its check observed · **Built** = code path exists, exit gate not re-run · **Partial** =
some of the step exists · **Not started**.

Last updated: 2026-11-24.

## Phase 0 - Real identity and multi-device foundations (Built)

| Step | What                                   | State | Notes                                                    |
| ---- | -------------------------------------- | ----- | -------------------------------------------------------- |
| 0.1  | Supabase Auth for both roles           | Built | Password/magic link, `/pair` six-digit device pairing    |
| 0.2  | RLS that actually enforces             | Partial | Policies + `pnpm test:rls`; two API routes still use the service role |
| 0.3  | Schema additions for later phases      | Built | `20261026000001_phase0_identity_and_v1_tables.sql`       |
| 0.4  | Onboarding fixes                       | Built | Term-weeks bug fixed in Phase 3; old rows need a manual fix |
| Gate | Two browsers, two accounts, one household | Not observed | Needs two real devices                          |

## Phase 1 - Repositories replace the demo seam (Done)

| Step | What                        | State |
| ---- | --------------------------- | ----- |
| 1.1  | Repository layer            | Done  |
| 1.2  | Curriculum from Postgres    | Done  |
| 1.3  | Screen-by-screen cutover    | Done  |
| Gate | No demo data with DEMO_MODE unset | Done (DEMO_MODE stays until the roadmap is at a confident state, see [unhardcoding.md](source-of-truth/unhardcoding.md)) |

## Phase 2 - Timetable (Built)

| Step | What                     | State |
| ---- | ------------------------ | ----- |
| 2.1  | Data model               | Done  |
| 2.2  | Parent timetable editor  | Built |
| 2.3  | Daily plan generator     | Built |
| 2.4  | Student timetable        | Built |
| Gate | Parent drags on phone, student follows | Not observed |

## Phase 3 - Parent authoring and the marking desk (Done, gate observed 2026-11-17)

| Step | What                         | State |
| ---- | ---------------------------- | ----- |
| 3.1  | Term planner writes          | Done  |
| 3.2  | Question bank                | Done  |
| 3.3  | Assessment builder           | Done  |
| 3.4  | Student sitting screen       | Done  |
| 3.5  | Marking desk writes          | Done  |
| 3.6  | Evidence review              | Done  |
| Gate | Quiz built, sat, marked down, mistake resolved on `/review` | Observed |

Summary: [phases/phase-3.md](phases/phase-3.md).

## Phase 4 - The student learning loop (Done, gate observed 2026-11-25)

| Step | What                                   | State       |
| ---- | -------------------------------------- | ----------- |
| pre  | RLS tightening (answer keys, learner-writable events/mistakes) | Done (RLS probes in `verify:phase4`) |
| 4.1  | `/today` from the timetable            | Done        |
| 4.2  | Checkpoints and practice write events  | Done        | `answer_checkpoint` + `answer_trivia_checkpoint` score in Postgres; wrong answers offer "Add to my notebook"; `/parent/trivia` authors modules |
| 4.3  | Spaced review (FSRS)                   | Done        | `ts-fsrs` scheduler in `src/lib/retention`; `record_review` claims each event once; `/review` has Due and Notebook tabs |
| 4.4  | Mastery and progress from events       | Done        | `objective_mastery()` + TS twin; student syllabus map, parent coverage/readiness/compliance |
| 4.5  | NBA on real inputs                     | Done        | Planner reads `objective_mastery()` and FSRS due dates; due review +50; scoring tests |
| Gate | Lesson + wrong checkpoint → mastery drops, review scheduled, in tomorrow's plan | Observed 2026-11-25 in `verify:phase4` |

## Phase 5 - Messaging, requests and remote monitoring (Done, gate observed 2026-11-25)

| Step | What                         | State | Notes |
| ---- | ---------------------------- | ----- | ----- |
| 5.1  | Structured requests          | Done  | Seven typed asks; `decide_request()` applies each effect; learner can only insert pending; 4-hour expiry |
| 5.2  | Messages                     | Done  | One household thread; text, photo, voice note; read receipts; typing over broadcast |
| 5.3  | Notifications                | Done  | Trigger-written notification rows, Web Push via `src/lib/push/notify.ts`, quiet hours, in-app centre |
| 5.4  | Live monitor (`/parent/live`)| Done  | 30 s heartbeat, idle alert, remote actions, end-of-day digest |
| Gate | Break asked, approved on the parent's screen, countdown on the device within 3 s | Observed: 1.4-1.9 s over four runs (production build). Push delivery checked with `verify:push`; a real phone not yet |

## Phases 6-9

| Phase | Goal                                    | State            |
| ----- | --------------------------------------- | ---------------- |
| 6     | Curriculum extraction, ten packages     | Done, gate observed 2026-11-26 |
| 7     | Mobile pass and installable app         | Merged 2026-11-27 on Ian's ruling; Lighthouse a11y 100 on both screens, phone run of the Phase 5 test still open ([phase-7](phases/phase-7.md)) |
| 8     | Hardening and staging                   | Not started      |
| 9     | Device lockdown app                     | Not started      |

## Cross-cutting: removing hard-coded examples

Tracked in [source-of-truth/unhardcoding.md](source-of-truth/unhardcoding.md).
