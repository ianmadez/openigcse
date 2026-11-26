# Loading the syllabus PDFs

OpenIGCSE is open source, but the Cambridge syllabus PDFs are Cambridge's copyright. They are never committed. Each
person who runs the project downloads them into `raw-syllabuses/` (git-ignored) and builds the curriculum packages
locally.

## 1. Download

```powershell
pnpm ingest:list                     # subjects, editions and the filename each one expects
pnpm fetch:syllabuses                # download every subject in the registry
pnpm fetch:syllabuses --subject=0620 # one subject
pnpm fetch:syllabuses --dry-run      # show the URLs without downloading
```

The fetcher opens each subject's Cambridge syllabus page (`syllabus_page` in `src/lib/curriculum/registry.ts`), picks
the PDF whose name carries the edition's years, and saves it as `<code>-<slug>-<years>.pdf`, for example
`0610-biology-2026-2028.pdf`. When no link matches, it reports the subject as missed rather than saving the wrong file.

If the fetcher misses a subject, download the PDF from the Cambridge page in a browser, save it under the expected
name, and check that it is a real PDF (it starts with `%PDF` and is a few hundred KB or more). Follow the fetching
ladder in [working-practices.md](working-practices.md) before deciding a file is unavailable.

## 2. Extract

```powershell
pnpm ingest --subject=0610 --dry-run   # counts only, writes nothing
pnpm ingest --subject=0610             # writes curriculum-packages/0610-biology-2026-2028/
pnpm test:parser                       # pinned counts for every PDF present
```

Each subject's `content_layout` in the registry picks the reader (sciences, maths, computer science, decimal-coded
humanities, history, languages). Ingest writes `verified: false`. It never fills gaps from memory. If it cannot find
the subject content, it stops.

## 3. Review, then import

A parent checks the extracted objectives against the PDF on the package review screen (Phase 6, Step 6.3) and marks the
package verified. Then:

```powershell
pnpm validate
pnpm import --subject=0610             # refuses unverified packages unless --allow-draft
```

## Changing syllabus edition (moving up a year)

The edition a learner needs depends on when they sit the exam, not on their current year group. Before each new school
year, compare the learner's target exam series (parent settings) with each subject's edition years
(`pnpm ingest:list`). If the exam falls outside a subject's edition, add the later edition to the registry, then
download, extract, review and import it as above. Objective lineage (Step 6.4) carries progress across editions.
