# Phase 8: Hardening and staging

Branch `phase-8`, 2026-11-28. Ian's rulings: no Sentry; staging is the local Docker Supabase (no free hosted project
slot); the live database was emptied so the family can set it up fresh.

## What it did

- **Hosting.** Vercel project `openigcse` (openigcse.vercel.app), functions pinned to `syd1` beside the Supabase
  project in Sydney (`vercel.json`). `/login` went from about 2.4 s to 0.5 s. Secrets are Vercel env vars;
  `PARENT_GATE_SECRET` is now its own random value instead of falling back to the service key.
- **Staging.** `npx supabase start` (Docker) replays every migration onto an empty Postgres. `.env.local` points at
  it, so `pnpm dev`, every `verify:*` script and the importer now work against staging by default. The live project's
  keys live in `.env.production.local`; `OPENIGCSE_TARGET=production` points the scripts there on purpose.
- **Fresh live database.** Every household row, file and account was deleted on 2026-11-28 at Ian's request; the
  imported curriculum was kept. The first visitor gets sign-up and onboarding.
- **Production flags.** On the live deployment (`VERCEL_ENV=production`) the onboarding bypass, the demo workspace and
  every DemoNote are off whatever the env vars say. The dev PIN hint was already gated on `NODE_ENV`.
- **Rate limits.** `hit_rate_limit()` (security definer, callable before sign-in) counts hashed keys: password sign-in
  10 per email+IP and 30 per IP in 15 minutes, magic links 5, pairing codes 5 per IP. The PIN already locked out after
  five wrong tries. A limiter that cannot be reached refuses the sign-in rather than waving it through.
- **Audit log.** `audit_log`, written by database triggers so no code path can skip it: parent unlocks and lockouts,
  request approvals and declines, first marks and mark changes (with from and to), device codes, pairings and
  revocations. Staff read their own household's log; nobody can update or delete it through the API.
- **Visible retry.** Every failed write says "Not saved" with a Try again button that repeats exactly that write
  (`WriteError`, and `FormMessage` gained `onRetry`): live asks, messages, request answers, live controls, Today's
  tasks, sittings (autosave, start, hand in, uploads), marking, timetable, notebook, corrections, evidence review,
  assessments, questions, trivia, term planner, package review, carry-over, quiet hours. Forms on `<form action>`
  keep their input and resubmit from their own button. The offline queue already lists what it holds.
- **Monitoring.** `/api/health` (200 when Postgres answers, 503 otherwise) and a GitHub Actions uptime check every 15
  minutes; a failed run emails the repository owner. Errors are read in Vercel's runtime logs.
- **CI.** `.github/workflows/ci.yml`: typecheck, unit tests, package validation and contrast, then a fresh Supabase
  with every migration replayed and the phase 3-8 probes, then the school day twice. On `main`, production
  migrations run with `supabase db push` after every check passes.
- **Backups.** `.github/workflows/backup.yml` dumps roles, schema, public data and auth nightly at 02:30 Sydney,
  restores the dump into a fresh Postgres in the same run, fails if any table's row count differs from live, then
  encrypts it (GPG, passphrase secret) and keeps it 30 days. The dump-and-restore was proved on Docker (44 tables,
  counts identical).
- **Export and deletion.** Settings > Household data: a JSON file of every household table, read through the
  guardian's own session, with seven-day links to each stored file; and deleting the household, its files and every
  account in it, behind a signed-in guardian, the PIN again and the word DELETE.
- **YouTube.** Checked against the YouTube API Services terms (2026-11-28): youtube-nocookie kept; the iframe is only
  created on the learner's click (no overlay, no load-time autoplay); dropped the deprecated `modestbranding`; the
  sandbox now lets the player's own YouTube links open; every player shows the YouTube Terms and Google Privacy links.
- **School-day test.** `pnpm test:e2e`: sign in, timetable, lesson, checkpoint (a wrong answer into the notebook),
  break request answered on `/parent/live`, quiz scheduled, sat and handed in, marked on the desk, then the learner
  sees 2/2 and the mistake waiting in Review. It refuses to run against anything but local Supabase.

## Checks

`pnpm typecheck` clean, `test:unit` 177/177, `verify:phase3` 34/34, `verify:phase4` 74/74, `verify:phase5` 48/48,
`verify:phase6` 17/17, `verify:phase8` 25/25 (rate limits, audit log, export scoping, deletion), all on Docker staging.
`pnpm build` clean. **Exit gate:** `pnpm test:e2e --repeat-each=2` passed twice in a row on a production build against
staging (24.5 s and 24.1 s).

## Still open

- GitHub secrets for the migration and backup jobs (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`). Until they are set those jobs fail, and the
  nightly backup has not yet run against live.
- The CI jobs have not run on GitHub yet; they were written and their steps run locally.
- Supabase Auth's Site URL and redirect URLs must include `https://openigcse.vercel.app`.
- `NEXT_PUBLIC_APP_ENV=development`, `ONBOARDING_BYPASS` and the `DEMO_*` variables are still set on Vercel. The code
  ignores them in production; removing them needs Ian's approval in the Vercel CLI.
