# Phase 5 - Messaging, requests and remote monitoring

Merged to `main` on 2026-11-25 from branch `phase-5`.
Exit gate observed 2026-11-25 on a production build in two browsers: the learner tapped Ask, Break; the parent's
`/parent/live` showed the ask; the parent tapped 10 min; the study device showed the break countdown 1.4-1.9 s later
(four runs, target 3 s). Web Push delivery was verified against a local HTTPS endpoint (`pnpm verify:push`); a real
phone is still to do and moves to Phase 7, where the app becomes installable.

## What it contains

| Step | Delivered |
| ---- | --------- |
| 5.1  | Seven typed requests with one-tap answers. `decide_request()` applies the effect in one transaction; learners can only insert a pending ask; one open ask per type; 4-hour expiry. |
| 5.2  | `/messages` and `/parent/messages`: one household thread with photos, voice notes, read receipts and a typing indicator. |
| 5.3  | Trigger-written notifications, the in-app bell, Web Push through `src/lib/push/notify.ts` and `public/sw.js`, quiet hours in Settings. |
| 5.4  | 30-second heartbeat, `/parent/live`, idle alert after 15 minutes in a lesson period, remote actions, end-of-day digest. |

Migrations `20261125000001` to `20261125000006`, all applied to the linked project with real row counts unchanged.
Checks: `pnpm verify:phase5` (48/48), `pnpm verify:push`, `pnpm test:unit` (151).

## Rulings (Ian, 2026-11-25)

- Push is sent from a server-only module with the service role, not an Edge Function. It only ever pushes rows the
  database triggers wrote, so a caller cannot aim a push at anyone.
- The end-of-day digest is push plus the in-app centre; no email.
- Migrations may be pushed after a clean dry run, with real row counts checked before and after.

## Found on the way

- `decide_request()` raised after marking a stale ask expired, which rolled the expiry back. Fixed in `000003`.
- "More time" extended the clock on screen but not in `sitting_is_open()` / `save_assessment_marks()`. Fixed in `000004`.
- The study machine's clock was 26 s off the database, so a 10-minute break showed 10:26. Countdowns now use
  database durations (`seconds_left()`, commit timestamps).
- Realtime never fired in the browser: React's dev double-mount reused a channel being removed. Each mount now gets
  its own topic and joins with the user's token.
- The first gate runs took 4-6.5 s. Guards made eight sequential round trips before the write, and full-page refreshes
  on every heartbeat queued ahead of the parent's tap. Actions now let the database functions do the checking, pushes run
  in `after()`, and the live screens apply Realtime payloads directly.
- UI pass (new elements only): the Ask sheet and banners were trapped inside the blurred top bar (now portalled), the
  bell popover ran off the left edge on phones, the thread grew the page instead of scrolling, and the request count
  could disagree with the live list.

## Carried forward

- Push on a real Android phone and an iPhone (Phase 7, with the installable app).
- The focus lock is a status in the browser; enforcing it is the kiosk app (Phase 9).
