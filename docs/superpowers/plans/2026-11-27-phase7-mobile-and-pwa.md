# Phase 7 plan: mobile pass and installable app

Branch `phase-7`, 2026-11-27. Roadmap goal: every screen works at 360 px, and both roles can install the app.

## Step 7.1 Layout system

- `src/lib/shell/tabs.ts` (tested): five phone tabs per role, More last; `activeTab()` lights a direct tab for its
  route and sub-routes, More for everything else.
- `AppShell`: tab bar below 640 px (`sm:hidden`, safe-area padding); the hamburger shows only 640-1024 px; More
  opens the drawer.
- `globals.css`: on `pointer: coarse`, `.btn`, `.nav-link`, `.field`, `.tab-btn`, `.touch-target` are at least
  44 px and `.icon-btn` at least 44 x 44 (min-* so `size-7` cannot undercut it).
- `inputMode="numeric"` on every integer field; a "Take a photo" camera input on evidence upload (touch only).

## Step 7.2 Screen sweep

- `.superpowers/pw/sweep.mjs`: every route at 360/768/1280, light and dark; sideways overflow, page errors, status,
  touch targets under 44 px.
- `check:contrast` runs as `prebuild`, so a contrast regression fails `pnpm build`.
- `pnpm test:visual`: Playwright screenshots of `/today`, `/timetable`, `/review`, `/messages`, `/parent/live`,
  `/parent/messages`, `/parent/marking-desk`, `/parent/timetable` at 360 light/dark and 1280, on a throwaway household.
- Phone timetable editor: tap or press-and-hold a block to change day/start/end (`phoneSlotTimes`, tested).

## Step 7.3 PWA

- `src/app/manifest.ts`, icons rendered by `scripts/make-icons.mjs`, Apple meta in the root layout.
- `public/sw.js`: cache-first for hashed assets and icons, network-first for `/` and `/today` with the cached copy
  offline, an offline page otherwise, the saved pages dropped on sign-out.
- `src/lib/offline/queue.ts` (tested) and `OfflineWritesProvider`: Start, Finish, Skip and study time are held while
  offline, shown in a banner, replayed in order; a replayed Start keeps its press time (`startTimeFor`, tested).

## Checks

`pnpm typecheck; pnpm test:unit; pnpm test:parser; pnpm validate; pnpm test:rls; pnpm build; pnpm test:visual`,
the sweep, `.superpowers/pw/offline.mjs` and `.superpowers/pw/install.mjs`.

## Exit gate

A parent completes the Phase 5 exit test entirely on a phone, and Lighthouse PWA and accessibility checks pass on
`/today` and `/parent/live`. Needs a real phone and a Lighthouse run; see the ledger.
