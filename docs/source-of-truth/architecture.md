# Architecture

## Request path

```
browser ─► src/middleware.ts (refresh Supabase cookie, sign out revoked devices)
        ─► app route (server component) or server action
        ─► src/lib/data/<entity>.ts  (session-bound client: createServerClientInstance)
        ─► Postgres, where RLS decides visibility
```

- **Reads** go through the server components and `src/lib/data/*`, never straight from the browser.
- **Parent writes** are server actions that start with `requireGuardianSession()`. That needs the PIN-gate cookie and a guardian profile in the same household.
- **Learner writes** start with `requireLearnerSession()`, which uses the caller's own `student` profile.
- **The service-role client** (`src/lib/supabase/admin.ts`) is for `scripts/` and the importer only. Any app use of it is a known gap to remove (see [unhardcoding.md](unhardcoding.md)).

## Layers

| Layer                        | Rule                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/<domain>/*.ts` pure | No I/O. Unit-tested with `node:test` (`*.test.ts`, listed in `package.json` `test:unit`). |
| `src/lib/data/*.ts`          | One module per entity. Returns `{ ok: false, error }` instead of throwing on a refused write. |
| `src/app/**/actions.ts`      | Guard → zod parse → repository → `revalidatePath`. Returns a `Result` the form shows. |
| `src/components/**`          | Semantic tokens only (`bg-card`, `text-secondary`, ...). Forms show `FormMessage`.   |
| `supabase/migrations/*.sql`  | All schema and RLS. Applied with `npx -y supabase@3.2.0 db push --remote`, after a `--dry-run`. |
| `src/lib/curriculum/registry.ts` | Configuration only: subject codes, names, routes, faculty colour. Never objectives. |

## Route groups

- `(student)`: `/today`, `/timetable`, `/subjects`, `/review`, `/plan`, `/progress`, `/trivia`, `/assessments`, `/evidence`.
- `(sitting)`: the distraction-free `/assessments/[id]`.
- `(parent)/parent/(gated)`: everything behind the PIN. This covers `term-planner`, `questions`, `assessments`, `marking-desk`, `timetable`, `focus`, `progress` and `settings`.
- `/login`, `/pair`, `/auth/callback`, `/parent/onboarding`: identity.

## Cross-cutting decisions

- **No invented syllabus content.** Objectives come from `pnpm ingest`, then `pnpm import`. Empty data shows an empty state.
- **Failed writes stay visible.** There is no `localStorage` fallback.
- **Time-critical state is owned by the server.** The sitting clock and its grace period live in Postgres (`assessment_sittings_guard`, `sitting_is_open`).
- **Multi-row consistency uses one plpgsql function** with `security invoker`, so RLS still applies. `save_assessment_marks` is the example.
