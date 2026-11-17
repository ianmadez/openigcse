# Raw syllabuses

Drop the official Cambridge syllabus PDFs here. Nothing in this folder is committed
except this file, because the PDFs are Cambridge copyright.

`pnpm ingest:list` prints the expected filename for every subject in the registry.
The filename pattern is `<code>-<slug>-<years>.pdf`, for example:

```
0580-mathematics-2028-2030.pdf
0478-computer-science-2026-2028.pdf
0610-biology-2026-2028.pdf
0620-chemistry-2026-2028.pdf
0625-physics-2026-2028.pdf
0500-english-first-language-2027-2029.pdf
0460-geography-2027-2029.pdf
0470-history-2027-2028.pdf
0455-economics-2027-2029.pdf
0530-spanish-2028-2030.pdf
```

## Where to get them

```powershell
pnpm fetch:syllabuses               # every subject in the registry
pnpm fetch:syllabuses --dry-run     # show the URL it would use
pnpm fetch:syllabuses --subject=0620
```

The script opens the syllabus page listed in `src/lib/curriculum/registry.ts`,
picks the PDF whose filename carries the version label, and saves it under the
expected name. When no link matches it reports the subject as missed instead of
downloading the wrong document. History 0470 is published by Cambridge as two
windows, 2027-2028 and 2029-2030; the registry tracks the 2027-2028 one.

## Running the extraction

```powershell
pnpm ingest -- --subject=0580 --pdf raw-syllabuses/0580-mathematics-2028-2030.pdf
pnpm ingest -- --subject=0625 --pdf raw-syllabuses/0625-physics-2026-2028.pdf --dry-run
```

The parser writes `curriculum-packages/<code>-<slug>-<years>/` and refuses to
write anything when it cannot find the "Subject content" section.

## What is deliberately not extracted yet

Assessment objectives live in a separate table in the PDF. The pipeline leaves
`assessment_objectives.json` empty and says so, rather than filling it in from
memory. Add them by hand from the PDF, or extend `parseSubjectContent`.