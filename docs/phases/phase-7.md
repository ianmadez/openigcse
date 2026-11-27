# Phase 7: Mobile pass and installable app

Branch `phase-7`, 2026-11-27. Plan and rulings: `docs/superpowers/plans/2026-11-27-phase7-*.md`.

## What it did

- **7.1 Layout system.** Below 640 px the sidebar becomes a five-tab bar (learner: Today, Timetable, Review, Inbox,
  More; parent: Live, Inbox, Marking, Timetable, More), with More opening the full drawer; 640-1024 px keeps the drawer.
  On touch screens the shared controls (`.btn`, `.icon-btn`, `.nav-link`, `.field`, `.tab-btn`) and any
  `.touch-target` are at least 44 px. Every integer field asks for the number pad. Evidence upload has a "Take a
  photo" camera input on phones and tablets (JPEG/PNG/WebP only, so an iPhone does not hand over HEIC).
- **7.2 Screen sweep.** Every route walked at 360, 768 and 1280 px in light and dark (150 page loads): no sideways
  scroll, no page errors, no failed loads. Fixed on the way: `/parent/curriculum` scrolled 371 px at 360 px (status
  chips now wrap), the `/today` reorder buttons were 28 px, and the timetable's 19 px drag cells showed on tablets
  (the day list now runs up to 1024 px). The phone timetable gained editing: tap or press-and-hold a block to change
  its day, start and end; Add takes a start time. `check:contrast` now runs before every build, and `pnpm
  test:visual` screenshots the eight busiest screens at 360 light/dark and 1280.
- **7.3 Installable app.** Web app manifest, icons (`scripts/make-icons.mjs`), Apple meta tags, and a service worker
  registered on every page. It caches hashed assets and the `/` and `/today` pages, opens `/today` offline, shows an
  offline page for anything else, and drops the saved pages on sign-out. `/today`'s Start, Finish, Skip and study
  time are held on the device while offline, listed in a banner, and replayed in order on reconnect; a replayed
  Start keeps the time it was pressed. Checkpoint answers and "I'm stuck" stay online-only (ledger ruling 5).

## Checks

`pnpm typecheck` clean, `test:unit` 177/177, `test:parser` 37/37, `validate` 10/10, `test:rls` 22/22,
`verify:phase4` 74/74, `verify:phase5` 48/48, `pnpm build` clean (contrast 60/60 as prebuild), `test:visual`
24/24 on two fresh households. In the browser: offline reload renders the plan, a Start pressed offline is held and
lands `in_progress` 0.3 s from the press after reconnecting; sign-out empties the page cache (1 to 0); Chrome reports
`/today` and `/parent/live` installable with no manifest errors; the phone timetable editor refuses an end before the
start and saves a snapped time.

## Review fixes

Self-review of the diff: sign-out went through the client router, which the worker never saw, so the saved plan
survived it (now the page tells the worker); the offline fallback served `/today`'s HTML under other URLs (now an
offline page); a write queued during a replay waited for the next trigger (now drained straight after);
`.touch-target` lost to a component's own `min-h-10` (now an `!important` utility on touch screens only).

## Not observed (exit gate)

- A parent completing the Phase 5 exit test entirely on a phone, and the timetable editor and learner strip on a real
  Android phone and iPhone.
- Lighthouse accessibility on `/today` and `/parent/live`. Lighthouse 12 has no PWA category; installability was
  checked with Chrome's own verdict instead. Running Lighthouse through `npx` was refused by this session's
  permission settings.

## Carried forward

- The held-writes queue is per device; a different account signing in on that device sees the old writes refused.
- Screenshot baselines are Chromium on Windows; record new ones (`pnpm test:visual --update-snapshots`) on another OS.
