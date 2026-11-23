# Workflow: one phase from plan to `main`

The roadmap PDF is the plan of record. Each phase runs on its own branch and lands on `main` only after its exit gate is observed.

1. **Branch.** Run `git switch -c phase-N` from an up-to-date `main`.
2. **Plan.** Write `docs/superpowers/plans/YYYY-MM-DD-phaseN-<name>.md`: the steps as tasks, the exact tests and the exit gate. Keep a sibling `...-ledger.md` that records every ruling (what was decided, why, and the cost if wrong) and every deferred minor.
3. **Build one step at a time, test first.** Pure logic goes in `src/lib/<domain>` with a failing `node:test` test before the code. Schema changes go in a new migration with RLS in the same file; a `--dry-run` comes before `db push --remote`. Commit each step separately.
4. **Check each screen in a browser,** at desktop and 390 px wide. Playwright helpers live in `.superpowers/pw/` (git-ignored). Write them with the Write tool, not shell heredocs, because heredocs mangle backslashes.
5. **Verify the whole branch:**
   ```powershell
   pnpm typecheck; pnpm test:unit; pnpm test:parser; pnpm validate
   pnpm test:rls; pnpm verify:phaseN   # DB gate on throwaway households, self-cleaning
   pnpm build; pnpm check:contrast
   ```
6. **Review.** A fresh reviewer reads the whole diff. Fix Critical and Important findings test-first; send Minors to the ledger.
7. **Observe the exit gate** on a throwaway household (`pnpm dev:household create|delete`). Never use the real household.
8. **Document before merge.** Write `docs/phases/phase-N.md` (what the phase did and contained, the review fixes, what it carries forward). Update `docs/done-work.md` and `docs/progress.md`.
9. **Merge and push.** Run `git switch main; git merge --no-ff phase-N`, re-run the checks on `main`, then `git push origin main` and delete the branch.

## Hard rules

- Production Supabase holds the learner's real household. No destructive writes to it. Test data is created with throwaway households and deleted afterwards. Check row counts before and after.
- Never commit `.env.local` or `raw-syllabuses/*.pdf`.
- Never invent syllabus content. If extraction fails, the screen shows an empty state.
- Mobile is checked per screen, not at the end.
