# Working practices

House rules for changing this repo. They exist because most of the expensive mistakes here were silent ones: a page
that looked populated, a package that looked extracted, a download that looked successful.

## Fetching anything from the internet

Assume the first attempt will fail, and treat one failed request as no evidence at all. Work down this ladder and record
what you tried.

1. **Project tooling.** WebFetch for a page, `curl -L -A "<user-agent>"` or PowerShell `Invoke-WebRequest` for a file.
   Follow redirects and keep cookies.
2. **Node `fetch` from a script.** Useful when the rest of the pipeline is TypeScript anyway, and it makes the request
   reproducible (`scripts/fetch-syllabuses.ts` is the reference implementation).
3. **Discover, do not guess.** Fetch the canonical page and read its links (`pdfLinks()` ranks candidates by version
   label) rather than constructing a deep URL that happens to look right. Cambridge renames and moves files between
   series.
4. **A real browser.** Playwright, or whatever headless browser the tooling offers, for pages that render their links
   in JavaScript, show a consent wall, or reject non-browser user agents.
5. **Alternate routes.** `/en/` or locale variants, the sitemap, the print view, the publisher's file server, an
   `http://` to `https://` swap, or the page for the previous syllabus version.
6. **Check what arrived before using it.** Status code, `content-type`, the first four bytes (`%PDF`), byte length, and
   — after extraction — the number of pages and a couple of expected headings. A 200 with a zero-byte body or an HTML
   error page is a failure, not a success.

For PDFs specifically:

- Extract with `pdfjs-dist` (already a dev dependency and what the ingest script uses). `python -m pymupdf` /
  `fitz` is a good second opinion when the parser and the PDF disagree, because it exposes positioned text directly.
- `pdfminer` is not installed; do not assume it is.
- Never write a partial package. If the Subject content section cannot be found, the script should fail loudly, and so
  should you.

If every method fails, stop and say which ones you tried and what each returned. **Never fill the gap from memory.**
Syllabus objectives, component weights and durations are exactly the things this project refuses to invent.

### Provenance and copyright

Every artefact records where it came from: URL or local filename, retrieval date, and the extraction method in
`provenance`. Cambridge syllabus PDFs stay out of git (`raw-syllabuses/*.pdf` is ignored) and extracted objective text is
their copyright — fine for this household, a question before publishing packages.

## Verifying a change

Run the smallest command that would fail if you were wrong, then widen only if it cannot settle the question.

| Change                                  | Command                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| TypeScript, props, imports              | `pnpm typecheck`                                                |
| Parser                                  | `pnpm test:parser`                                              |
| Curriculum package shape                | `pnpm validate`                                                 |
| Colour tokens or contrast               | `pnpm check:contrast`                                           |
| RLS policies                            | `pnpm test:rls` (needs the linked project and test credentials) |
| Routes, server actions, build-time data | `pnpm dev`, then the screen itself                              |

Server components and RLS are not exercised by typecheck, so a screen change is not done until the route has been opened
with a real session and the write survived a reload. A failed write must render an error; "Saved on this device" is not
a success message.

## Changing data or schema

- One repository module per entity in `src/lib/data/`, using `createServerClientInstance()` so RLS applies.
- New household-scoped tables need `household_id` and a policy built on `public.current_household_id()` in the same
  migration; staff checks are always paired with a household membership check.
- Curriculum imports stay idempotent by natural key, and admin-only paths keep the `x-admin-token` header check.
- Delete the demo path as each screen goes live. `DEMO_MODE` is for screenshots, nothing else.

## Keeping progress honest

Progress is only ever expressed as a roadmap phase and step. When a step lands, update
[docs/progress.md](progress.md) in the same change, including the date and the command output that proves it. When a
step is partially done, say which half is missing rather than rounding up; the "What still looks finished but is not"
section exists for that reason.

## This machine

Windows, PowerShell 5.1-compatible syntax (`;` and `if ($?) { }`, not `&&`), pnpm 11 on Node 22. Paths in `src/app`
contain `[slug]` and `(student)` segments, so use `-LiteralPath` or quoting when touching them from the shell. Each
PowerShell call starts fresh: no `Set-Location`, environment variable or virtualenv activation carries over.
