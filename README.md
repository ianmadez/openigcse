# OpenIGCSE

A study workspace for a homeschooled private candidate working towards Cambridge IGCSE. Nothing about the household is
baked in: onboarding records who the guardian is, who is studying, which exam series is being entered and when the terms
run, and every screen reads from that record.

It splits cleanly into two areas: a quiet place for the student to work, and a separate place for the parent to plan,
mark and adjust focus.

## Docs

- [CLAUDE.md](CLAUDE.md) - commands, layout, ground rules and the fetch ladder for anyone (or anything) changing code.
- [docs/progress.md](docs/progress.md) - what exists today, phase by phase, with the gaps named plainly.
- [docs/working-practices.md](docs/working-practices.md) - fetching, verifying, schema and provenance rules.
- [ARCHITECTURE_MAP.txt](ARCHITECTURE_MAP.txt) - a dated snapshot of the tree before Phases 0-2.

Progress is tracked against [OpenIGCSE V1 Roadmap.pdf](<OpenIGCSE V1 Roadmap.pdf>) only. The roadmap is the plan; the
docs record how far along it we are.

## Run it

```powershell
pnpm install
pnpm dev          # http://localhost:3000
```

Copy `.env.example` to `.env.local` first. Supabase is required for real data: every screen reads its own household's
rows through the session, so without a project and a signed-in account the screens show honest empty states rather
than sample content. `DEMO_MODE=true` swaps in a fixed demo queue on `/today` for screenshots.

| Command                      | What it does                                                |
| ---------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                   | Next.js dev server                                          |
| `pnpm build`                 | Production build                                            |
| `pnpm typecheck`             | `tsc --noEmit`                                              |
| `pnpm validate`              | Zod + integrity check on every curriculum package           |
| `pnpm import --subject=0610` | Upsert one package into Supabase                            |
| `pnpm ingest --subject=0580` | Deterministic PDF extraction for one syllabus               |
| `pnpm ingest:list`           | Registry of subjects, versions and expected PDF filenames   |
| `pnpm test:parser`           | Unit tests for the syllabus parser                          |
| `pnpm test:unit`             | Unit tests for marking, questions, sittings and uploads     |
| `pnpm verify:phase3`         | Phase 3 exit gate with real JWTs on throwaway households    |
| `pnpm dev:household create`  | Throwaway household for browser checks (`delete` removes)   |
| `pnpm test:rls`              | Proves the tenant policies hold against the linked project  |
| `pnpm check:contrast`        | Measures every declared colour pair in both appearances     |
| `pnpm sync:packages`         | Regenerates manifests and routes from topics and objectives |

## Two areas, one app

**Student** - `/today`, `/timetable`, `/subjects`, `/assessments`, `/review`, `/evidence`, `/plan`, `/progress`,
`/trivia`. A paper opens at `/assessments/[id]`, outside the shell.

**Parent** - `/parent`, `/parent/timetable`, `/parent/term-planner`, `/parent/questions`, `/parent/assessments`,
`/parent/marking-desk`, `/parent/focus`, `/parent/progress`, `/parent/onboarding`, `/parent/settings`.

## Assessments and marking

The parent writes questions at `/parent/questions` (multiple choice, short answer, structured with marked parts,
calculation; Markdown with KaTeX maths; diagrams uploaded to the private `household-files` bucket), each tagged to one
syllabus objective. `/parent/assessments` builds a weekly quiz, topic test, mid-term, final or past paper from the bank,
can auto-pick from the learner's weakest objectives, records grade thresholds the parent types in, and schedules the
paper onto the learner's day plan.

The learner sits it at `/assessments/[id]`: the clock runs from the server's start time, answers autosave every 10
seconds, photos of working upload to the learner's own folder, and the paper hands itself in when time runs out. The
database refuses answers after that, and a learner can never write marks or reopen a handed-in paper.

The marking desk shows each answer beside the model answer and marking guide. Every dropped mark needs a reason. One
save calls `save_assessment_marks`, which writes the marks, one notebook mistake per dropped mark and one
`Formal_Assessment` learning event per objective in a single transaction, so a refused save writes nothing and a
re-save updates in place. Learners send other work from `/evidence`; the parent approves it or asks for changes from
the overview.

### Identity

`/login` signs a guardian in with email and password, or with an email magic link; the link lands on `/auth/callback`,
which exchanges the code for a session cookie. `src/middleware.ts` refreshes that cookie on every request.

`/pair` (also a tab on `/login`) pairs a learner device: the guardian generates a six-digit code in
`/parent/settings`, the code is stored only as a SHA-256 hash on `devices.pairing_code_hash` and expires after fifteen
minutes. Redeeming it creates a Supabase Auth user for that device, binds it to the learner profile through
`profiles.auth_user_id` and signs the device in. Postgres therefore resolves `public.current_household_id()` from a real
JWT. Revoking a device sets `devices.revoked_at`, and middleware drops that session on its next request.

### First run and the guardian gate

With an empty database (or a household whose `onboarding_completed` is false) `/` and `/today` redirect to
`/parent/onboarding`. Step 0 of that page signs the guardian in (or creates the account), because a household belongs to
an auth user. The wizard then collects the household and country (which sets the Cambridge administrative zone used for
paper variants), timezone, a 4 to 6 digit guardian PIN, the learner and stage, the target exam series, three term dates,
and the subject and entry-route selection. One server action, `completeOnboardingAction`, writes the whole set and is
idempotent: a guardian who already has a household edits those rows in place instead of creating a second one.

The bypass switch `ONBOARDING_BYPASS=true` skips the redirect when you want to look around a database that has no
household yet. It never blocks the wizard; you can still open `/parent/onboarding` and finish it.

Once a household exists, `/parent` and its children ask for the guardian PIN. The PIN is stored as an scrypt hash on
`households.guardian_pin_hash`. The unlock is a server action that writes a signed, httpOnly gate cookie for eight hours;
`lockParent` clears it. Every attempt is logged to `pin_attempt_logs`: five failures inside ten minutes lock the parent
area for ten minutes and raise a notification for the guardian. Settings writes also accept a live guardian session, so
a signed-in guardian can rotate the PIN and manage devices without retyping it.

## The timetable

`/parent/timetable` is where a parent draws the week. Pick a subject or a non-subject block from the palette, then
click a column to place it; drag a block to move it or drag its bottom edge to resize, snapped to 15 minutes. The same
edits work from the keyboard: arrows move a focused block, Shift+arrows resize it, Delete removes it. Blocks save on
release, and the page warns about overlapping blocks, weekly minutes against each subject's allocation, and days over
the term's daily cap.

School hours come from `academic_terms.school_day_start` / `school_day_end`, so a late start is one term setting.

`timetable_overrides` holds the exceptions — holiday, sick day, half day, exam day, a Ramadan schedule or anything
custom — with an optional minutes cap and a "keep the streak" flag. A date with an override replaces the weekly
template for that day rather than deleting the week.

`/timetable` is the learner's read-only week, and `/today` opens with a period strip: a now line, the current period
named, the next period's start time, and a banner plus a cue when the period changes (both respect the mute toggle).

### The plan generator

The timetable decides _when_ and _which subject_; `rankActivities()` decides _what_ to do inside the period. That split
keeps a parent in control of the week without hand-picking every objective.

`generateDayPlan()` in `src/lib/data/plan.ts` runs on first open of `/today` and on demand from the editor. For each of
the day's slots it writes one `day_plan_items` row, choosing the best-ranked objective for that slot's subject and
avoiding an objective already used that day. Unfinished items from earlier days roll into the next slot for the same
subject. It is idempotent: the loop skips slots that already have an item, and a unique index on
`(student_id, plan_date, slot_id)` backstops a race between two renders. Because a half-finished day should not be
silently rewritten, the term's daily cap is advisory (a warning in the editor) while a per-date override cap is enforced.

## Curriculum pipeline

No syllabus content is written from memory. The parser reads the official PDF and rebuilds the numbered hierarchy the
document already contains.

1. Save a syllabus PDF into `raw-syllabuses/`. `pnpm ingest:list` prints the expected filename.
2. Run `pnpm ingest -- --subject=<code>`. Use `--dry-run` to check the extraction without writing.
3. `pnpm validate` checks the package against the zod contracts in `src/lib/curriculum/schemas.ts`.
4. `pnpm import --package=<folder>` (or `POST /api/curriculum/import` with `{"packageId":"<folder>"}` and an
   `x-admin-token` header) writes it to Supabase. Re-runs are idempotent: rows are matched on their natural keys, so
   nothing duplicates.

What the parser does: it groups positioned text into rows, finds the Core and Supplement columns, walks `1`, `1.1` and
bulleted objectives, reads the command word from the objective text and stamps provenance. When it cannot find the
Subject content section it exits with an error rather than writing a partial package.

What it refuses to do: invent objectives, infer assessment-objective weightings, or guess component durations. Routes come
from the registry in `src/lib/curriculum/registry.ts`, which holds the private candidate configuration:

| Subject                                    | Route                                                       |
| ------------------------------------------ | ----------------------------------------------------------- |
| Biology 0610, Chemistry 0620, Physics 0625 | Extended tier, Papers 2, 4 and 6 (Alternative to Practical) |
| Geography 0460                             | Paper 1 (36%), Paper 2 (36%), Paper 4 (28%)                 |
| History 0470                               | Paper 1, Paper 2, Paper 4 Alternative to Coursework         |
| Economics 0455                             | Written papers, no coursework                               |
| Languages 0530 / 0520                      | Four skill papers                                           |
| Global Perspectives 0457                   | Excluded: requires school-authenticated coursework          |

Packages currently in the repository are drafts written before the pipeline existed. They are labelled `Draft`
everywhere, carry `provenance.verified: false`, and the importer rejects them unless `allowDraft` is passed.

The app no longer imports those packages. `/subjects`, `/subjects/[slug]`, the sidebar tree and the onboarding subject
picker read the imported rows from Postgres (`subjects`, `syllabus_versions`, `entry_routes`, `topics`,
`learning_objectives`, `resources`), scoped to the entry routes the learner is enrolled for. The JSON stays in the
repository only as the parser's output format, and `src/lib/curriculum/index.ts` — the module that used to bundle it —
is gone.

## The data layer

There is no demo seam left. `src/lib/data/` holds one repository module per entity (`terms`, `enrollments`,
`curriculum`, `objectives`, `assessments`, `assessment-builder`, `question-bank`, `sittings`, `marking`, `evidence`,
`files`, `mistakes`, `events`, `retention`, `questions`, `timetable`, `requests`, `devices`, `focus`, `trivia`), and every one of them talks to Postgres through the session-bound server client, so RLS is what
decides which rows exist. `getLearnerWorkspace(learnerId, date)` composes them for the screens that need the whole
picture: `/today`, `/review` and `/progress`.

`getSetupState()` is the entry point every page shares. It is wrapped in React `cache`, resolves the signed-in profile
once per request and returns `householdId`, `learnerId`, `activeTermId` and the running term, or one of two honest
failures: `signed-out` (show a sign-in or pairing prompt) and `unconfigured` (the account has no household yet). Screens
never guess an id, and nothing falls back to "the first household in the table" for a signed-in user.

`DEMO_MODE=true` is the one exception: `/today` swaps in a fixed demo queue so screenshots do not depend on rows. It is
documented in `.env.example` and nothing else reads it.

## Database

The schema is applied through `supabase/migrations/` and pushed with `supabase db push`. The first file is the base
hierarchy; the `20261021…` files are additive extensions for extraction gaps, resource activity keys, onboarding and
trivia; `20261026000001_phase0_identity_and_v1_tables.sql` adds the auth link, the tightened tenant policies and the V1
tables; `20261026000002_phase2_timetable_columns.sql` adds the timetable columns the editor and the generator need;
`20261117000001_phase3_authoring_and_marking.sql` adds sittings, responses, the storage bucket and the marking function,
and scopes question templates to their household.

```
awarding_bodies -> qualifications -> subjects -> syllabus_versions
  -> components -> entry_routes -> entry_route_components
  -> assessment_objectives -> topics -> learning_objectives
```

People and planning: `households` (with `country_code`, `cambridge_admin_zone`, `guardian_pin_hash`,
`onboarding_completed`), `profiles` (guardian and learner, linked to `auth.users` through `auth_user_id`),
`academic_terms` (with `school_day_start`, `school_day_end`, `daily_minutes_cap`), `learner_term_enrollments`.

Study day: `devices`, `pin_attempt_logs`, `timetable_slots`, `timetable_overrides`, `day_plan_items`, `requests`,
`messages`, `notifications`, `push_subscriptions`, `focus_policies`.Assessment and activity tables sit beside them: `question_templates`, `term_assessments`, `assessment_items`,
`assessment_item_marks`, `mistake_notebook`, `learning_events`, `kiosk_sessions`, plus `trivia_modules` and
`trivia_questions` for the trivia centre.

### Row level security

Every tenant table is scoped by `public.current_household_id()` or `public.current_profile_id()`, both of which resolve
through `profiles.auth_user_id` (and fall back to `profiles.id = auth.uid()` for rows created before Supabase Auth).
`public.is_household_staff()` is never used on its own: a staff check is always paired with a household membership
check, so a guardian in one household can never read or write another's rows. Suspending a device is a policy
question, not an app question: `devices.revoked_at` is read by `public.device_session_state()`.

`pnpm test:rls` proves it against the linked project. It runs the anon key against every tenant table (expects zero rows)
and attempts writes to parent-only tables (expects them refused). Set `RLS_TEST_STUDENT_EMAIL` and
`RLS_TEST_STUDENT_PASSWORD` to add the same checks for a real learner session. The write probes use values that cannot
satisfy the foreign keys, so a failed probe cannot leave a row behind.

Question banks are never stored in the repository. They live in `question_templates`, scoped to one household, and are
authored at `/parent/questions`.

## Design system

- **Colour.** One accent ramp (teal, hue 195) plus one warm neutral, with status ramps only where the product renders
  them. Primitives are declared in `src/app/globals.css`; components only ever reference a semantic token such as
  `bg-card`, `text-secondary` or `border-subtle`. `pnpm check:contrast` confirms all 56 rendered pairs in both
  appearances; every one passes WCAG AA. Subject identity rides on top of that, with its own accent per faculty
  (azure for STEM, emerald for biology, violet for physics, amber for humanities, rose for languages).
- **Surfaces.** One card treatment: a 1px border, a 16px radius, no drop shadow. Shadows are reserved for overlays.
- **Press states.** Buttons and pickable cards carry a heavier bottom border that collapses on press, so a tap reads as
  physical rather than a colour flash.
- **Type.** Bricolage Grotesque for headings and Inter for interface text, on a five-step scale: caption, body, heading,
  title, display.
- **Motion.** Short transitions on interactive state, press to 0.96, and nothing that ignores `prefers-reduced-motion`.
- **Sound.** [cuelume](https://www.npmjs.com/package/cuelume) synthesises every cue at runtime, so there are no audio
  files to ship. `src/components/sound/SoundProvider.tsx` is the only place it is wired up: `bind()` handles clicks,
  hovers, typing, deleting and selection, and success, warning and error cues are read from the `role="status"`,
  `role="alert"` and `aria-live` feedback the UI already renders. Feature components never call a sound directly. The
  speaker button beside the theme switch mutes everything and remembers the choice.
- **Light first.** Light is the default. Dark applies only when someone chooses it, and the choice is remembered.

## Layout

```
src/app/(student)/      Student routes and their shell
src/app/(parent)/parent/  Parent gate, onboarding, settings, routes and server actions
src/app/login/          Guardian sign-in (password, magic link, device pairing)
src/app/pair/           Student device pairing with a six-digit code
src/app/auth/callback/  Exchanges the magic-link code for a session
src/app/api/            Learning events, mistakes, curriculum import
src/components/auth/    Sign-in panel, pairing form, onboarding account step
src/components/shell/   Shared app shell, collapsible subject navigation
src/components/sound/   The single place interface sound is wired up
src/components/student/ Study block, timer, stuck button, mistake list, trivia player
src/components/parent/  Gate, onboarding wizard, settings forms, term planner, marking desk, focus
src/components/ui/      Panels, status pills, meters, callouts, skeletons
src/lib/auth/           Session lookups, gate token signing, pairing-code helpers
src/lib/config/         Regions, stages, exam series, study-day options
src/lib/curriculum/     Registry, schemas, importer, package loader
src/lib/data/           Repositories: one module per entity, all on the session client
src/lib/planning/       Next-best-activity ranking
src/middleware.ts       Session refresh and revoked-device sign-out
scripts/                Ingestion, validation, contrast check, parser tests, RLS checks
```
