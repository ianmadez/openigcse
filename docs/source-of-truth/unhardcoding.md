# Removing hard-coded examples

The app must show only the household's own rows and the official syllabus. Anything typed into the code that looks like
data (sample objectives, per-subject lookups repeated in several files, fixed lists that belong in the database) is
tracked here until it is gone.

## Method

1. **Find the duplicate or the fake.**
   ```bash
   grep -rnE '"0[0-9]{3}"' src          # subject codes in code
   grep -rniE 'demo|sample|mock' src
   ```
2. **Decide where it belongs.**
   - Syllabus facts belong in Postgres, via `pnpm ingest` and `pnpm import`.
   - Household choices belong in a household table.
   - Configuration about a subject (colour family, slug, route) belongs on the subject's entry in `src/lib/curriculum/registry.ts`. That entry is the one place a subject code may appear.
3. **Fix it test-first.** Write a unit test that pins the single source, point every caller at it, and delete the copies.
4. **Leave an empty state, never a fallback sample.**

## Timing

Examples stay in place until the roadmap is at a confident state (the Phase 4 exit gate is observed at the earliest).
Until then this register is the plan; nothing is removed early.

## Register

| # | Where | What is hard-coded | Fix | State |
| - | ----- | ------------------ | --- | ----- |
| 1 | `src/lib/data/workspace.ts` `demoWorkspace`, `DEMO_MODE` | Invented Biology/Physics/Maths objectives and a fake term shown on `/today` | Delete demo mode; the empty state covers an empty database | Open: remove once the roadmap is at a confident state (after the Phase 4 gate) |
| 2 | `components/ui/primitives.tsx` `facultyFor`, `components/shell/AppShell.tsx` `facultyKey`, `parent/(gated)/timetable/page.tsx` and `actions.ts` `COLOUR` | Subject code → colour family, copied in 4 places | `faculty` on each registry entry + `facultyForCode()` | Open: same timing as row 1 |
| 3 | `parent/(gated)/timetable/page.tsx` | Uses `createAdminClient()` in an app route | Session client + RLS | Open |
| 4 | `POST /api/learning-events`, `PATCH /api/mistakes` | Service role and "one student per household" | Learner session + RLS (Phase 4 RLS step) | Open |
| 5 | `src/lib/config/site.ts` `examSeriesYears` | Fixed list 2027-2031 | Derive from the current year | Open |
| 6 | `src/lib/data/trivia.ts` `topicArea` union | Four fixed topic areas | Read from `trivia_modules` (4.2 authoring form) | Open |
| 7 | `AssessmentBuilder` placeholder "Cells and transport quiz" | Example title text | Neutral placeholder | Open (cosmetic) |

Add a row whenever you find another. Close a row only when no copy remains in the code.
