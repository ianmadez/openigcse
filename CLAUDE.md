# CLAUDE.md

OpenIGCSE is a study workspace for one homeschooled Cambridge IGCSE candidate and their parent. The learner works in
`/today`, `/timetable`, `/subjects`, `/review`, `/plan`, `/progress` and `/trivia`; the parent plans, marks and adjusts
focus behind a PIN gate at `/parent/*`. Next.js 15 App Router + React 19, Supabase Postgres with row level security,
Tailwind. Every screen reads the signed-in household's own rows through the session client, and an empty database shows
honest empty states rather than sample content.

Read on demand, not all up front:

- [docs/source-of-truth/](docs/source-of-truth/README.md): [architecture](docs/source-of-truth/architecture.md),
  [data model](docs/source-of-truth/data-model.md), [phase workflow](docs/source-of-truth/workflow.md),
  [hard-coded examples register](docs/source-of-truth/unhardcoding.md).
- [docs/done-work.md](docs/done-work.md): roadmap step checklist. [docs/phases/](docs/phases/): one summary per merged phase.
- [docs/progress.md](docs/progress.md): honest gaps. [docs/working-practices.md](docs/working-practices.md): fetching rules.
- [README.md](README.md): product tour.

## Commands

```powershell
pnpm install                       # once
pnpm dev                           # http://localhost:3000
pnpm typecheck                     # tsc --noEmit
pnpm test:parser                   # syllabus parser unit tests
pnpm validate                      # zod + integrity check on every curriculum package
pnpm check:contrast                # every declared colour pair, both appearances
pnpm build                         # production build (last, not first)
pnpm test:rls                      # policy probes against the linked Supabase project
pnpm import --subject=0610         # upsert one package into Supabase
pnpm ingest --subject=0580         # PDF extraction for one syllabus
```

Copy `.env.example` to `.env.local` before running. Without Supabase credentials the app still boots and every screen
shows its sign-in or unconfigured state.

## Where things live

```
src/app/(student)/        learner routes
src/app/(parent)/parent/  guard, onboarding, settings, planning, server actions
src/app/api/              learning events, mistakes, curriculum import
src/components/           shell, student, parent, ui, sound
src/lib/data/             one repository per entity, all on the session client
src/lib/curriculum/       registry, zod schemas, package importer
src/lib/planning/         next-best-activity ranking
supabase/migrations/      schema and RLS, applied with `supabase db push`
scripts/                  ingestion, validation, contrast, parser tests, RLS checks
raw-syllabuses/           local Cambridge PDFs (gitignored, copyright)
```

## Ground rules

1. **Progress is the roadmap.** [OpenIGCSE V1 Roadmap.pdf](<OpenIGCSE V1 Roadmap.pdf>) is the plan; every status claim
   in this repo is expressed as a roadmap phase and step (for example "Step 3.5"). Work one step at a time, and update
   [docs/progress.md](docs/progress.md) when a step lands or its state changes.
2. **Data goes through `src/lib/data/`.** Use the session-bound client so RLS decides what is visible. The service-role
   client belongs to the importer and admin scripts, not to app reads or writes.
3. **Schema changes are migrations.** Any new household-scoped table gets `household_id` and its RLS policy in the same
   migration, plus the matching repository module.
4. **No invented syllabus content.** Objectives, components, weightings and durations come from the official PDFs via
   `pnpm ingest`; `src/lib/curriculum/registry.ts` holds only configuration. Draft packages stay `verified: false` and
   the UI keeps labelling them as drafts.
5. **Failed writes stay visible.** No silent `localStorage` fallback on a real screen; if Postgres refused, say so.
6. **Design tokens only.** Components reference semantic classes (`bg-card`, `text-secondary`, `border-subtle`), never
   raw colours, and motion respects `prefers-reduced-motion`.
7. **Mobile is checked per screen**, not batched at the end.
8. **[ARCHITECTURE_MAP.txt](ARCHITECTURE_MAP.txt) is a dated snapshot** (2026-10-20, before Phases 0-2). Use it to
   understand the old shape, not as current truth.

## Fetching from the internet

A single attempt is not evidence. When a page, PDF or API does not come back on the first try, work down this ladder
before concluding anything is unavailable:

1. Project tooling (WebFetch / `curl` / PowerShell `Invoke-WebRequest`) with a normal user agent.
2. Node `fetch` from a script, or `curl.exe -L` to follow redirects and keep cookies.
3. The canonical page that links to the artefact, then discover the link (see `pdfLinks()` in
   `scripts/fetch-syllabuses.ts`) instead of guessing a deep URL.
4. A headless browser (Playwright) for JS-rendered pages, consent walls or bot checks.
5. Alternate formats and mirrors: `/en/` variants, sitemap, print view, the publisher's file server.
6. Verify what arrived (status, `content-type`, first bytes, byte length) before parsing or saving it.

If every method fails, say which ones you tried and stop. Never fill the gap from memory. The full rule, including PDF
extraction, provenance and copyright notes, is in [docs/working-practices.md](docs/working-practices.md).

## Skills

Skills live in `.agents/skills/`. On Windows, `.claude/skills/*` are junctions to those folders so Claude Code and
Copilot read one source; on a clone that has the copies as plain folders, treat `.agents/skills/` as the original and
re-point or re-copy rather than letting the two diverge.
