# OpenIGCSE Setup Guide

This guide takes a household from nothing to a working study app: the parent's account, the learner's device, the
timetable and the subjects. It describes the app as it stands after Phase 7 (November 2026). Hosting and the locked
study device arrive in Phases 8 and 9; the places that will change are marked **Later**.

## What you need

- A Windows, Mac or Linux computer to run the app (the "server").
- A free Supabase project, which holds the household's data.
- Node.js 20 or newer and pnpm.
- The learner's device (laptop, tablet or phone) and the parent's phone, on the same Wi-Fi as the server.
- The official Cambridge syllabus PDFs for the subjects you are entering. They are copyrighted, so they are not
  included; see `docs/syllabus-pdfs.md`.

## Part 1: Install the app

1. Download the project and open a terminal in its folder.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env.local`.
4. Fill in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from your Supabase
     project (Project Settings, then API).
   - `PARENT_GATE_SECRET`: any long random string you make up. Keep it the same from then on.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, for notifications: run
     `npx web-push generate-vapid-keys` and paste the two keys.
   - Leave `DEMO_MODE` empty and `ONBOARDING_BYPASS=false`.
5. Never share `.env.local`. The service role key can read every household.

## Part 2: Prepare the database

1. Install the Supabase CLI and link it to your project: `supabase link`.
2. Apply the schema: `supabase db push`. This creates every table and the privacy rules that keep each household's
   data to itself.
3. Load the curriculum. For each subject: put its PDF in `raw-syllabuses/`, then run
   `pnpm run import --subject=0610` (use the subject's code). The ten packages in the repository are already
   checked, so you only extract a PDF again when Cambridge publishes a new syllabus.
4. Check it worked: `pnpm validate` should report every package as valid.

## Part 3: Start the app

1. Run `pnpm build`, then `pnpm start`.
2. On the server, open `http://localhost:3000`.
3. To reach it from other devices on your Wi-Fi, start it with `pnpm start -H 0.0.0.0`, find the server's local
   address (for example `192.168.1.20`) and open `http://192.168.1.20:3000` on the device.

**Later (Phase 8):** the app will be hosted at a secure `https://` address. Until then, installing it to a home screen,
opening it offline and push notifications work only on the server itself, because browsers allow those features only
on secure addresses. Everything else works over your Wi-Fi.

## Part 4: Create the household (parent)

1. Open the app and choose **Sign in**. Create the parent account with your email and a password (or use the email
   link).
2. You are taken to **Onboarding**. Work through its four steps:
   - **Household:** your country and a parent PIN of at least four digits. The PIN guards every parent screen; do not
     tell the learner.
   - **Learner:** their name, stage and target exam series (for example June 2028).
   - **Calendar:** the school terms, with mid-term and final weeks. Check terms 2 and 3 carefully; the term planner
     refuses to save terms whose dates are wrong.
   - **Subjects:** the subjects being entered and their routes (Core or Extended where Cambridge offers both).
3. Finish. You land on the **Parent overview**.

## Part 5: Connect the learner's device

1. On the parent side open **Settings** and press **Generate pairing code**. A six-digit code appears.
2. On the learner's device, open the app and go to `/pair`. Enter the code.
3. The device now has its own sign-in. It opens on the learner's area only; the parent area still needs the PIN.
4. To remove a device later (lost, replaced), revoke it in **Settings**. It is signed out on its next visit.

## Part 6: Plan the school week

1. **Timetable** (parent): pick a subject chip, then click (or tap) the week to place blocks. Drag to move and pull the
   bottom edge to resize. On a phone or tablet, tap a block to change its day and times. Add breaks, revision and free
   study the same way.
2. **Copy Monday to weekdays** saves time if most days are alike. **Generate plan** builds today's study list from the
   timetable.
3. **Term planner:** spread each subject's topics across the term's weeks and mark the assessment weeks.
4. **Focus:** the session length and allowed hours. **Later (Phase 9):** these are enforced by the lockdown app; in a
   browser they are shown as a status only.
5. **Settings:** quiet hours for notifications, so the parent's phone stays silent at night.

## Part 7: Notifications and the home screen

1. On each device, open the bell icon and turn notifications on. Allow them when the browser asks.
2. To install the app: in Chrome or Edge, use **Install app** from the menu; on an iPhone, use **Share, then Add to
   Home Screen**. An iPhone shows notifications only for an app added to the home screen.
3. If notifications are refused, the bell still lists everything in the app.

Both need the secure address from Phase 8 when used from a phone (see Part 3).

## Part 8: Moving up a year

When the learner moves to the next stage or a new syllabus edition, follow `docs/syllabus-pdfs.md`: import the new
package, then open **Curriculum** in the parent area, confirm the links between old and new objectives, and press
**Move progress** so earlier work carries over.

## Troubleshooting

- **A screen says nothing is set up:** onboarding was not finished, or the learner has no enrolled subjects for the
  current term.
- **"The server could not be reached":** the server is off or the device left the Wi-Fi.
- **The PIN is refused five times:** the gate locks for a while. Wait, then try again.
- **Today's plan is empty:** draw the timetable, then press **Generate plan**. Without a timetable, Today shows a ranked
  list from the enrolled subjects instead.
- **A change made offline is listed as "held on this device":** it is sent automatically when the connection returns,
  or press **Send now**. If the database refuses it, the banner says why.
