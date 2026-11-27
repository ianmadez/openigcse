# Phase 7 ledger

Rulings (what, why, cost if wrong) and deferred minors.

## Rulings

1. **Phone is below 640 px, the drawer stays for tablets.** The tab bar is `sm:hidden`; 640-1024 px keeps the
   hamburger drawer, above that the fixed sidebar. Cost if wrong: a tablet in portrait has no tab bar.
2. **Touch targets are enforced in CSS on `pointer: coarse`, not per component.** Desktop keeps its density; phones
   and tablets get 44 px on the shared classes, plus `.touch-target` for one-off controls. Inline links inside a
   sentence (breadcrumbs, "Change", "Back to the bank") are left as text links, which WCAG 2.5.8 exempts.
3. **No tables to collapse.** The marking desk, question bank and enrolment lists were already built as wrapping
   lists and cards; the sweep found no sideways scroll on them at 360 px. The one overflow (`/parent/curriculum`,
   371 px) came from a nowrap status chip; `Status` now wraps.
4. **The offline queue lives in the page, not the worker.** `/today`'s writes are server actions that need the
   page's session and Next's action ids; a worker replay would have neither. The queue is in `localStorage` and the
   banner names every held write, so it is not the silent fallback CLAUDE.md rule 5 forbids. Only a network failure
   queues; a Postgres refusal on replay is shown by name and dropped, never retried.
5. **Checkpoint answers and "I'm stuck" stay online-only.** A checkpoint is scored by the server and the learner
   needs the feedback; "I'm stuck" raises a live request a parent must see. Holding either would pretend something
   happened. Offline, they show the normal "could not be reached" error.
6. **A replayed Start keeps the press time** if it is within 12 hours and not in the future (`startTimeFor`);
   otherwise the server's time. Observed: 0.3 s from the press after an 8 s offline gap.
7. **Only `/` and `/today` are kept for offline.** Other pages answer offline with a small offline page rather than
   another page's HTML, which would confuse the router.
8. **Sign-out drops the saved pages.** Sign-out reaches `/login` through the client router, which the worker never
   sees as a navigation, so the page posts `signed-out` to the worker; a revoked device redirected by middleware is
   caught in the worker too. Observed: 1 saved page before, 0 after.
9. **One manifest for both roles**, starting at `/`, the role-aware menu. Shortcuts to `/today` and `/parent/live`.
10. **Lighthouse 12 has no PWA category.** Installability was checked with Chrome's own verdict
    (`Page.getInstallabilityErrors`): `/today` and `/parent/live` installable, no manifest errors. Running Lighthouse
    for accessibility through `npx` was refused by this session's permission settings; it is left for Ian to run.
11. **Phone timetable editing is tap or press-and-hold.** Long-press alone is not discoverable and iOS does not fire
    `contextmenu`, so a tap opens the same editor; the hold is a shortcut for people who expect it.

## Deferred minors

- The exit gate needs a real phone (Phase 5 exit test as a parent on a phone) and a real Android and iPhone for the
  timetable editor and the learner timetable strip. Not observed in this session.
- Lighthouse accessibility on `/today` and `/parent/live` not run (ruling 10).
- The held-writes queue is per device, not per user: if a learner signs out with writes held, the next account on
  that device replays them and Postgres refuses them (shown, then dropped).
- Screenshot baselines are Chromium on Windows; another OS renders fonts differently and needs its own baselines.
- Full-page screenshots draw the fixed tab bar where the viewport ended; expected, not a layout bug.
